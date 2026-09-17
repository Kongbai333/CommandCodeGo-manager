// Step 2.3 遥测测试:三个端点(流式/非流式/错误)的请求都落库,
// usage_daily 聚合正确;记录不含消息正文。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { setup } from './helpers.mjs';

const AUTH = { Authorization: 'Bearer user_test' };

/** 打开被测代理工作目录里的库(只读查询)。 */
function openDb(proxy) { return new DatabaseSync(join(proxy.dir, 'ccp.db')); }

test('telemetry:非流式 chat —— 端点/模型/状态/流式标记/token/finish_reason 落库', async () => {
  const s = await setup();
  try {
    const r = await s.proxy.post('/v1/chat/completions',
      { model: 'm', messages: [{ role: 'user', content: 'hi' }] }, AUTH);
    assert.equal(r.status, 200);
    await sleep(400); // 遥测异步落库
    const db = openDb(s.proxy);
    const rows = db.prepare("SELECT * FROM requests WHERE endpoint = '/v1/chat/completions'").all();
    db.close();
    assert.equal(rows.length, 1);
    const row = rows[0];
    assert.equal(row.status_code, 200);
    assert.equal(row.model, 'm');
    assert.equal(row.stream, 0);
    assert.equal(row.proxy_key, '(direct)');
    assert.equal(row.input_tokens, 9);
    assert.equal(row.output_tokens, 3);
    assert.equal(row.finish_reason, 'stop');
    assert.ok(row.duration_ms >= 0);
    assert.equal(row.client_disconnected, 0);
  } finally { await s.close(); }
});

test('telemetry:流式 chat —— stream=1,tokens 来自 translator 终态', async () => {
  const s = await setup();
  try {
    const r = await s.proxy.post('/v1/chat/completions',
      { model: 'm', stream: true, messages: [{ role: 'user', content: 'hi' }] }, AUTH);
    assert.equal(r.status, 200);
    await r.text(); // 读完整流
    await sleep(400);
    const db = openDb(s.proxy);
    const row = db.prepare("SELECT * FROM requests WHERE endpoint = '/v1/chat/completions' AND stream = 1").get();
    db.close();
    assert.ok(row, 'streaming row recorded');
    assert.equal(row.input_tokens, 9);
    assert.equal(row.output_tokens, 3);
  } finally { await s.close(); }
});

test('telemetry:/v1/messages 非流式也记录', async () => {
  const s = await setup();
  try {
    const r = await s.proxy.post('/v1/messages',
      { model: 'm', max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] },
      { 'x-api-key': 'user_test' });
    assert.equal(r.status, 200);
    await sleep(400);
    const db = openDb(s.proxy);
    const row = db.prepare("SELECT * FROM requests WHERE endpoint = '/v1/messages'").get();
    db.close();
    assert.ok(row);
    assert.equal(row.status_code, 200);
    assert.equal(row.output_tokens, 3);
  } finally { await s.close(); }
});

test('telemetry:401(无凭据)也记录,无 usage', async () => {
  const s = await setup();
  try {
    const r = await s.proxy.post('/v1/chat/completions',
      { model: 'm', messages: [{ role: 'user', content: 'hi' }] });
    assert.equal(r.status, 401);
    await sleep(400);
    const db = openDb(s.proxy);
    const row = db.prepare("SELECT * FROM requests WHERE status_code = 401").get();
    db.close();
    assert.ok(row);
    assert.equal(row.error_type, 'http_401');
    assert.equal(row.input_tokens, 0);
    assert.equal(row.output_tokens, 0);
  } finally { await s.close(); }
});

test('telemetry:usage_daily 按天×key×model 聚合(直通 key_id 为 NULL)', async () => {
  const s = await setup();
  try {
    await s.proxy.post('/v1/chat/completions',
      { model: 'm', messages: [{ role: 'user', content: 'hi' }] }, AUTH);
    await s.proxy.post('/v1/chat/completions',
      { model: 'm', stream: true, messages: [{ role: 'user', content: 'hi' }] }, AUTH);
    await s.proxy.post('/v1/messages',
      { model: 'm', max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] },
      { 'x-api-key': 'user_test' });
    await sleep(500);
    const db = openDb(s.proxy);
    const rows = db.prepare('SELECT * FROM usage_daily').all();
    db.close();
    // 三次成功请求(两次 chat + 一次 messages),全部直通(key_id 哨兵 0)、模型 'm'
    const agg = rows.find(x => x.model === 'm' && x.key_id === 0);
    assert.ok(agg, 'usage_daily row exists');
    assert.equal(agg.requests, 3);
    assert.equal(agg.input_tokens, 27);
    assert.equal(agg.output_tokens, 9);
  } finally { await s.close(); }
});
