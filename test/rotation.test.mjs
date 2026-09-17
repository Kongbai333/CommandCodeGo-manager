// H5 额度耗尽自动轮转测试:上游按密钥区分响应(key1 → 402,key2 → 200),
// 验证客户端密钥自动切换、耗尽标记、全部耗尽语义与手动恢复。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { startMockUpstream, startProxy } from './helpers.mjs';

process.env.CCP_DATA_DIR = mkdtempSync(join(tmpdir(), 'ccp-rot-'));
process.on('exit', () => { try { rmSync(process.env.CCP_DATA_DIR, { recursive: true, force: true }); } catch {} });
const { SCHEMA } = await import('../src/store/db.mjs');

const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const KEY_A = 'user_rot_a_willexhaust1';
const KEY_B = 'user_rot_b_still_ok__2';

// mock 上游:A 的请求回 402(额度耗尽),其余正常;测试 4 模拟计费周期重置后放行 A
let exhaustA = true;
const mock = await startMockUpstream({
  onRequest: (req, res) => {
    if (exhaustA && req.headers['authorization'] === `Bearer ${KEY_A}`) {
      res.writeHead(402, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'payment required: quota exhausted' } }));
      return false;
    }
    return; // 走默认正常应答
  },
});

// 预置库:上游 A/B + 客户端密钥绑定 A
const workdir = mkdtempSync(join(tmpdir(), 'ccp-rot-proxy-'));
writeFileSync(join(workdir, 'config.json'), '{}');
const db = new DatabaseSync(join(workdir, 'ccp.db'));
db.exec(SCHEMA);
const token = 'sk-ccp-' + randomBytes(16).toString('hex');
db.prepare('INSERT INTO upstream_keys (name, api_key, status, created_at) VALUES (?,?,?,?)').run('账户A', KEY_A, 'active', Date.now());
db.prepare('INSERT INTO upstream_keys (name, api_key, status, created_at) VALUES (?,?,?,?)').run('账户B', KEY_B, 'active', Date.now());
db.prepare('INSERT INTO client_keys (name, key_hash, key_prefix, upstream_key_id, status, created_at) VALUES (?,?,?,?,?,?)')
  .run('zcode', sha256(token), token.slice(0, 16) + '…', 1, 'active', Date.now());
db.close();

const proxy = await startProxy({ upstreamPort: mock.port, cwd: workdir });
after(async () => {
  await proxy.kill();
  await mock.close();
  try { rmSync(workdir, { recursive: true, force: true }); } catch {}
});

const statusOf = (name) => {
  const d = new DatabaseSync(join(workdir, 'ccp.db'));
  const r = d.prepare('SELECT status FROM upstream_keys WHERE name = ?').get(name);
  d.close();
  return r.status;
};
const chat = () => proxy.post('/v1/chat/completions',
  { model: 'm', messages: [{ role: 'user', content: 'hi' }] },
  { Authorization: `Bearer ${token}` });

test('rotation:绑定密钥 402 → 当次请求自动切换到备用账户并成功', async () => {
  const r = await chat();
  assert.equal(r.status, 200, '轮转后请求成功');
  await sleep(200);
  assert.equal(statusOf('账户A'), 'exhausted', 'A 被标记为额度耗尽');
  assert.equal(statusOf('账户B'), 'active', 'B 保持可用');
});

test('rotation:后续请求直接走 B,不再打到 A', async () => {
  const r = await chat();
  assert.equal(r.status, 200);
  const auths = mock.seen.filter(s => s.url === '/alpha/generate').map(s => s.headers['authorization']);
  assert.equal(auths.filter(a => a === `Bearer ${KEY_A}`).length, 1, 'A 只在第一次轮转前被打过一次(402 那次)');
  assert.ok(auths.filter(a => a === `Bearer ${KEY_B}`).length >= 2, '后续请求都走 B');
});

test('rotation:所有账户耗尽 → 402→429 语义返回,B 也被标记;再请求 401', async () => {
  // 换一个对 A、B 都回 402 的 mock(新代理进程,同 workdir 数据)
  const mock2 = await startMockUpstream({
    onRequest: (req, res) => {
      const a = req.headers['authorization'];
      if (a === `Bearer ${KEY_A}` || a === `Bearer ${KEY_B}`) {
        res.writeHead(402, { 'Content-Type': 'application/json' });
        res.end('{"error":{"message":"payment required"}}');
        return false;
      }
    },
  });
  const proxy2 = await startProxy({ upstreamPort: mock2.port, cwd: workdir });
  try {
    const r = await proxy2.post('/v1/chat/completions',
      { model: 'm', messages: [{ role: 'user', content: 'hi' }] },
      { Authorization: `Bearer ${token}` });
    assert.equal(r.status, 429, '无账户可轮转:402 → 429(可重试语义)');
    assert.equal((await r.json()).error.type, 'rate_limit_error');
    await sleep(200);
    assert.equal(statusOf('账户B'), 'exhausted', 'B 也被标记耗尽');

    const r2 = await proxy2.post('/v1/chat/completions',
      { model: 'm', messages: [{ role: 'user', content: 'hi' }] },
      { Authorization: `Bearer ${token}` });
    assert.equal(r2.status, 401, '没有任何可用上游 → 401');
    assert.match((await r2.json()).error.message, /missing or disabled/);
  } finally {
    await proxy2.kill();
    await mock2.close();
  }
});

test('rotation:手动重新启用 A 后,绑定优先恢复', async () => {
  exhaustA = false; // 模拟额度周期重置,上游不再对 A 回 402
  const r = await fetch(proxy.base + '/admin/api/upstream-keys/1', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'active' }),
  });
  assert.equal(r.status, 200);
  assert.equal(statusOf('账户A'), 'active');
  // B 仍 exhausted → 绑定的 A 恢复可用,不再轮转
  const chatR = await chat();
  assert.equal(chatR.status, 200);
  assert.equal(mock.lastGenerate()?.headers['authorization'], `Bearer ${KEY_A}`);
});
