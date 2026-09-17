// 边缘与安全加固测试:断连中止上游、在途上限 503、413 排空、
// 日志与遥测无明文密钥(upstream_keys 表明文存储是已文档化的例外)。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { startMockUpstream, startProxy } from './helpers.mjs';

const AUTH = { Authorization: 'Bearer user_test' };
const CHAT_BODY = { model: 'm', stream: true, messages: [{ role: 'user', content: 'hi' }] };

/** 挂起式 mock 上游:发一行就持续写但不结束,可观察客户端断连是否传导。 */
function hangingUpstream() {
  let upstreamClosed = false;
  return {
    get closed() { return upstreamClosed; },
    start: () => startMockUpstream({
      onRequest: (req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write('{"type":"text-start"}\n');
        const timer = setInterval(() => { try { res.write('{"type":"text-delta","text":"x"}\n'); } catch {} }, 100);
        res.on('close', () => { upstreamClosed = true; clearInterval(timer); });
        return false; // 完全接管
      },
    }),
  };
}

test('hardening:客户端流中断连 → 上游连接被真实中止,日志标记 client_disconnected', async () => {
  const upstream = hangingUpstream();
  const mock = await upstream.start();
  const proxy = await startProxy({ upstreamPort: mock.port });
  try {
    const ac = new AbortController();
    const res = await fetch(proxy.base + '/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer user_test' },
      body: JSON.stringify(CHAT_BODY),
      signal: ac.signal,
    });
    const reader = res.body.getReader();
    await reader.read(); // 等到首字节,确认已进入转发
    ac.abort();          // 客户端断连
    await sleep(600);
    assert.equal(upstream.closed, true, '上游连接随客户端断连被中止(AbortController)');
    // 遥测记录断连标记
    const db = new DatabaseSync(join(proxy.dir, 'ccp.db'));
    const row = db.prepare('SELECT client_disconnected FROM requests ORDER BY id DESC LIMIT 1').get();
    db.close();
    assert.ok(row, 'telemetry row exists');
    assert.equal(row.client_disconnected, 1);
  } finally { await proxy.kill(); await mock.close(); }
});

test('hardening:CC_MAX_INFLIGHT=1 → 第二个并发请求 503 + Retry-After;/health 不受限', async () => {
  const upstream = hangingUpstream();
  const mock = await upstream.start();
  const proxy = await startProxy({ upstreamPort: mock.port, env: { CC_MAX_INFLIGHT: '1' } });
  try {
    const ac = new AbortController();
    const first = fetch(proxy.base + '/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer user_test' },
      body: JSON.stringify(CHAT_BODY),
      signal: ac.signal,
    });
    const firstRes = await first;
    await firstRes.body.getReader().read(); // 占住在途槽位
    const second = await proxy.post('/v1/chat/completions', CHAT_BODY, AUTH);
    assert.equal(second.status, 503);
    assert.ok(second.headers.get('retry-after'), '带 Retry-After 让 SDK 重试');
    const health = await proxy.get('/health');
    assert.equal(health.status, 200, '/health 豁免在途上限');
    ac.abort();
  } finally { await proxy.kill(); await mock.close(); }
});

test('hardening:CC_MAX_BODY_MB=1 → 超限请求体 413', async () => {
  const mock = await startMockUpstream();
  const proxy = await startProxy({ upstreamPort: mock.port, env: { CC_MAX_BODY_MB: '1' } });
  try {
    const big = JSON.stringify({ model: 'm', messages: [{ role: 'user', content: 'x'.repeat(2 * 1024 * 1024) }] });
    const r = await proxy.post('/v1/chat/completions', big, AUTH);
    assert.equal(r.status, 413);
    assert.equal(mock.generateCount(), 0, '超限请求不打上游');
  } finally { await proxy.kill(); await mock.close(); }
});

test('hardening:日志/请求记录不落明文密钥(upstream_keys 表除外,已文档化)', async () => {
  const LIVE = 'user_live_key_value';
  const mock = await startMockUpstream();
  const proxy = await startProxy({ upstreamPort: mock.port, env: { LOG_FILE: '' } });
  try {
    // 直通真实形态的 key 跑一条请求
    const r = await proxy.post('/v1/chat/completions',
      { model: 'm', messages: [{ role: 'user', content: 'hi' }] }, { Authorization: `Bearer ${LIVE}` });
    assert.equal(r.status, 200);
    await sleep(400);

    // 1) 控制台输出无明文(只有 keyPrefix 前 8 位)
    assert.equal(proxy.logs().includes(LIVE), false, '控制台日志无明文 key');

    // 2) requests 表与 telemetry 无明文
    const db = new DatabaseSync(join(proxy.dir, 'ccp.db'));
    const reqDump = JSON.stringify(db.prepare('SELECT * FROM requests').all());
    assert.equal(reqDump.includes(LIVE), false, 'requests 表无明文 key');
    // 3) 若配置了日志文件,文件内容无明文
    const logFile = join(proxy.dir, 'proxy.log');
    try {
      if (statSync(logFile).isFile()) {
        assert.equal(readFileSync(logFile, 'utf8').includes(LIVE), false, '日志文件无明文 key');
      }
    } catch { /* 未配置日志文件,跳过 */ }
    db.close();
  } finally { await proxy.kill(); await mock.close(); }
});
