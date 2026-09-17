// Step 2.2 鉴权接缝测试:在代理工作目录预置 ccp.db(模拟已创建的密钥),
// 走 HTTP 全链路验证 sk-ccp-* 路由、直通开关与 config 兜底。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startMockUpstream, startProxy } from './helpers.mjs';

// 本测试进程导入 db.mjs 仅为拿 SCHEMA,给它一个一次性数据目录
process.env.CCP_DATA_DIR = mkdtempSync(join(tmpdir(), 'ccp-auth-self-'));
process.on('exit', () => { try { rmSync(process.env.CCP_DATA_DIR, { recursive: true, force: true }); } catch {} });
const { SCHEMA } = await import('../src/store/db.mjs');

const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const mkToken = () => 'sk-ccp-' + randomBytes(16).toString('hex');

/** 预置一个带密钥的工作目录,再启动 mock 上游 + 代理。 */
async function setupAuth({ config } = {}) {
  const mock = await startMockUpstream();
  const workdir = mkdtempSync(join(tmpdir(), 'ccp-auth-'));
  writeFileSync(join(workdir, 'config.json'), JSON.stringify(config ?? {}));

  const db = new DatabaseSync(join(workdir, 'ccp.db'));
  db.exec(SCHEMA);
  const nowTs = Date.now();
  const insUp = db.prepare('INSERT INTO upstream_keys (name, api_key, status, created_at) VALUES (?, ?, ?, ?)');
  const insClient = db.prepare('INSERT INTO client_keys (name, key_hash, key_prefix, upstream_key_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?)');
  // upstream 1: active;upstream 2: disabled
  insUp.run('go-plan', 'user_seeded_upstream_0001', 'active', nowTs);
  insUp.run('expired', 'user_seeded_upstream_0002', 'disabled', nowTs);

  const tokens = { valid: mkToken(), revoked: mkToken(), boundDisabled: mkToken() };
  insClient.run('zcode', sha256(tokens.valid), tokens.valid.slice(0, 16) + '…', 1, 'active', nowTs);
  insClient.run('old', sha256(tokens.revoked), tokens.revoked.slice(0, 16) + '…', 1, 'disabled', nowTs);
  insClient.run('bound-expired', sha256(tokens.boundDisabled), tokens.boundDisabled.slice(0, 16) + '…', 2, 'active', nowTs);
  db.close();

  const proxy = await startProxy({ upstreamPort: mock.port, cwd: workdir });
  return {
    mock, proxy, tokens,
    async close() { await proxy.kill(); await mock.close(); try { rmSync(workdir, { recursive: true, force: true }); } catch {} },
  };
}

const CHAT_BODY = { model: 'm', messages: [{ role: 'user', content: 'hi' }] };

test('auth:sk-ccp-* 客户端 key → 路由到绑定的上游 key(mock 收到 Bearer user_seeded_upstream_0001)', async () => {
  const s = await setupAuth();
  try {
    const r = await s.proxy.post('/v1/chat/completions', CHAT_BODY,
      { Authorization: `Bearer ${s.tokens.valid}` });
    assert.equal(r.status, 200);
    assert.equal(s.mock.lastGenerate().headers['authorization'], 'Bearer user_seeded_upstream_0001');
  } finally { await s.close(); }
});

test('auth:客户端 key 经 /v1/messages 的 x-api-key 头同样命中', async () => {
  const s = await setupAuth();
  try {
    const r = await s.proxy.post('/v1/messages',
      { model: 'm', max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] },
      { 'x-api-key': s.tokens.valid });
    assert.equal(r.status, 200);
    assert.equal(s.mock.lastGenerate().headers['authorization'], 'Bearer user_seeded_upstream_0001');
  } finally { await s.close(); }
});

test('auth:伪造/未知的 sk-ccp-* → 401 invalid_client_key', async () => {
  const s = await setupAuth();
  try {
    const r = await s.proxy.post('/v1/chat/completions', CHAT_BODY,
      { Authorization: `Bearer ${mkToken()}` });
    assert.equal(r.status, 401);
    const json = await r.json();
    assert.match(json.error.message, /Invalid or disabled client key/);
  } finally { await s.close(); }
});

test('auth:吊销(disabled)的客户端 key → 401', async () => {
  const s = await setupAuth();
  try {
    const r = await s.proxy.post('/v1/chat/completions', CHAT_BODY,
      { Authorization: `Bearer ${s.tokens.revoked}` });
    assert.equal(r.status, 401);
  } finally { await s.close(); }
});

test('auth:绑定的上游 key 停用 → 自动轮转到其他启用账户(H5);全部不可用 → 401', async () => {
  const s = await setupAuth();
  try {
    // boundDisabled 绑定的是已停用的 upstream 2 → 轮转到 active 的 upstream 1
    const r = await s.proxy.post('/v1/chat/completions', CHAT_BODY,
      { Authorization: `Bearer ${s.tokens.boundDisabled}` });
    assert.equal(r.status, 200, '自动轮转到其他启用账户');
    assert.equal(s.mock.lastGenerate().headers['authorization'], 'Bearer user_seeded_upstream_0001');

    // 把 1 也停掉(经管理 API,作用于代理进程的库)→ 无可用账户
    const stop = await fetch(s.proxy.base + '/admin/api/upstream-keys/1', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'disabled' }),
    });
    assert.equal(stop.status, 200);
    const r2 = await s.proxy.post('/v1/chat/completions', CHAT_BODY,
      { Authorization: `Bearer ${s.tokens.valid}` });
    assert.equal(r2.status, 401);
    assert.match((await r2.json()).error.message, /missing or disabled/);
  } finally { await s.close(); }
});

test('auth:user_* 直通默认放行(参考用法保持兼容)', async () => {
  const s = await setupAuth();
  try {
    const r = await s.proxy.post('/v1/chat/completions', CHAT_BODY,
      { Authorization: 'Bearer user_anyone' });
    assert.equal(r.status, 200);
    assert.equal(s.mock.lastGenerate().headers['authorization'], 'Bearer user_anyone');
  } finally { await s.close(); }
});

test('auth:allowDirectUpstreamKey=false → user_* 直通 401,sk-ccp 仍可用', async () => {
  const s = await setupAuth({ config: { allowDirectUpstreamKey: false } });
  try {
    const r = await s.proxy.post('/v1/chat/completions', CHAT_BODY,
      { Authorization: 'Bearer user_anyone' });
    assert.equal(r.status, 401);
    const json = await r.json();
    assert.match(json.error.message, /disabled on this proxy/);
    const r2 = await s.proxy.post('/v1/chat/completions', CHAT_BODY,
      { Authorization: `Bearer ${s.tokens.valid}` });
    assert.equal(r2.status, 200);
  } finally { await s.close(); }
});

test('auth:config.apiKey 兜底 —— 无凭据请求使用配置里的 key', async () => {
  const s = await setupAuth({ config: { apiKey: 'user_config_fallback_9' } });
  try {
    const r = await s.proxy.post('/v1/chat/completions', CHAT_BODY);
    assert.equal(r.status, 200);
    assert.equal(s.mock.lastGenerate().headers['authorization'], 'Bearer user_config_fallback_9');
  } finally { await s.close(); }
});

test('auth:/v1/models 无凭据 → 仍返回静态列表(keyless 行为保持)', async () => {
  const s = await setupAuth();
  try {
    const r = await s.proxy.get('/v1/models');
    assert.equal(r.status, 200);
    const json = await r.json();
    assert.ok(json.data.length > 0);
  } finally { await s.close(); }
});
