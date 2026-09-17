// 截图/演示数据种子:mock 上游 + 历史用量 + 今日真实请求。
// 用法:node scripts/demo-seed.mjs <dataDir> <port>   (服务随后自己起)
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SCHEMA } from '../src/store/db.mjs';

const dataDir = process.argv[2];
const proxyPort = process.argv[3] ?? '3051';
if (!dataDir) { console.error('usage: node scripts/demo-seed.mjs <dataDir> [port]'); process.exit(1); }
mkdirSync(dataDir, { recursive: true });

const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const DEMO_ADMIN_TOKEN = 'ccp-admin-demo-token-for-screenshots';
const MODELS = ['deepseek/deepseek-v4-flash', 'glm/glm-5.2', 'moonshot/kimi-k2.7-code', 'minimax/minimax-m3', 'qwen/qwen3.7-max'];

// ── 1) 预置 config(admin token 固定,便于脚本登录) ──
writeFileSync(join(dataDir, 'config.json'), '{}');

// ── 2) 预置 DB:keys + 过去 16 天历史用量 ──
const db = new DatabaseSync(join(dataDir, 'ccp.db'));
db.exec(SCHEMA);
const now = Date.now();
const insUp = db.prepare('INSERT INTO upstream_keys (name, api_key, status, created_at, last_used_at) VALUES (?, ?, ?, ?, ?)');
insUp.run('go-plan 主号', 'user_demo_go_plan_0001', 'active', now - 15 * 86400e3, now - 3600e3);
insUp.run('备用号', 'user_demo_backup_0002', 'disabled', now - 12 * 86400e3, now - 6 * 86400e3);
const insClient = db.prepare('INSERT INTO client_keys (name, key_hash, key_prefix, upstream_key_id, status, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
const c1Token = 'sk-ccp-' + 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6'.repeat(1);
insClient.run('zcode', sha256(c1Token), 'sk-ccp-a1b2c3d4…', 1, 'active', now - 14 * 86400e3, now - 60e3);
insClient.run('claude-code', sha256('sk-ccp-' + 'f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3'), 'sk-ccp-f6e5d4c3…', 1, 'active', now - 9 * 86400e3, now - 3 * 3600e3);
insClient.run('opencode(旧)', sha256('sk-ccp-' + '0123456789abcdef0123456789abcdef'), 'sk-ccp-01234567…', 2, 'disabled', now - 11 * 86400e3, now - 5 * 86400e3);

const insReq = db.prepare(`INSERT INTO requests (ts, endpoint, proxy_key, upstream_key_id, model, status_code, stream, duration_ms, input_tokens, output_tokens, cached_tokens, finish_reason, client_disconnected) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`);
const upUsage = db.prepare(`INSERT INTO usage_daily (day, key_id, model, input_tokens, output_tokens, cached_tokens, requests) VALUES (?, ?, ?, ?, ?, ?, 1)
  ON CONFLICT (day, key_id, model) DO UPDATE SET input_tokens = input_tokens + excluded.input_tokens, output_tokens = output_tokens + excluded.output_tokens, cached_tokens = cached_tokens + excluded.cached_tokens, requests = requests + 1`);
const dayStr = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const endpoints = ['/v1/chat/completions', '/v1/messages', '/v1/responses'];
let seed = 42; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

for (let d = 16; d >= 1; d--) {
  const dayBase = now - d * 86400e3;
  const n = 6 + Math.floor(rnd() * 18);
  for (let i = 0; i < n; i++) {
    const model = MODELS[Math.floor(rnd() * MODELS.length)];
    const endpoint = endpoints[Math.floor(rnd() * endpoints.length)];
    const keyName = rnd() < 0.55 ? 'zcode' : rnd() < 0.8 ? 'claude-code' : '(direct)';
    const keyId = keyName === 'zcode' ? 1 : keyName === 'claude-code' ? 2 : 0;
    const err = rnd() < 0.06;
    const inp = 800 + Math.floor(rnd() * 6000);
    const outp = err ? 0 : 300 + Math.floor(rnd() * 2500);
    const cached = Math.floor(inp * rnd() * 0.7);
    const ts = dayBase + Math.floor(rnd() * 86400e3 * 0.9);
    insReq.run(ts, endpoint, keyName, keyName === '(direct)' ? null : 1, model,
      err ? 429 : 200, rnd() < 0.7 ? 1 : 0, 400 + Math.floor(rnd() * 8000),
      inp, outp, cached, err ? null : 'stop');
    if (!err) upUsage.run(dayStr(ts), keyId, model, inp, outp, cached);
  }
}
db.close();

// ── 3) mock 上游(与真实 CC wire 形态一致的最小实现) ──
const upstream = http.createServer((req, res) => {
  const chunks = []; req.on('data', c => chunks.push(c));
  req.on('end', () => {
    if (req.url === '/provider/v1/models') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: MODELS.concat(['minimax/m2.7', 'deepseek/deepseek-v4-pro', 'longcat/longcat-2.0']).map(id => ({ id })) }));
      return;
    }
    if (req.url === '/alpha/fingerprint/record' || req.url === '/alpha/lifecycle-events') {
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{}'); return;
    }
    if (req.url === '/alpha/generate') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const texts = ['好的,这个函数的作用是…', 'Here is the refactored version…', '分析完成:问题出在…'];
      const text = texts[Math.floor(rnd() * texts.length)];
      res.write('{"type":"text-start"}\n');
      for (const seg of text.match(/.{1,6}/g) ?? []) res.write(JSON.stringify({ type: 'text-delta', text: seg }) + '\n');
      res.write('{"type":"text-end"}\n');
      const inp = 900 + Math.floor(rnd() * 4000), outp = 200 + Math.floor(rnd() * 1200);
      res.write(JSON.stringify({ type: 'finish-step', finishReason: 'stop', usage: { inputTokens: inp, outputTokens: outp } }) + '\n');
      res.write(JSON.stringify({ type: 'finish', finishReason: 'stop', totalUsage: { inputTokens: inp, outputTokens: outp, cachedInputTokens: Math.floor(inp * 0.4) } }) + '\n');
      res.end(); return;
    }
    res.writeHead(404); res.end('{}');
  });
});
await new Promise(r => upstream.listen(0, '127.0.0.1', r));
const upstreamPort = upstream.address().port;

// ── 4) 起代理(子进程) ──
const { spawn } = await import('node:child_process');
const child = spawn(process.execPath, ['server.mjs'], {
  cwd: new URL('..', import.meta.url).pathname,
  env: { ...process.env, PORT: proxyPort, HOST: '127.0.0.1', CCP_DATA_DIR: dataDir, CC_API_BASE: `http://127.0.0.1:${upstreamPort}` },
  stdio: ['ignore', 'inherit', 'inherit'],
});
const base = `http://127.0.0.1:${proxyPort}`;
for (let i = 0; i < 80; i++) { try { const r = await fetch(base + '/health'); if (r.ok) break; } catch {} await new Promise(r => setTimeout(r, 150)); }

// ── 5) 今日真实流量(混合端点/流式/直通/错误) ──
const H = { 'X-Admin-Token': DEMO_ADMIN_TOKEN, 'Content-Type': 'application/json' };
const chat = (body, key = c1Token) => fetch(base + '/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify(body) });
for (let i = 0; i < 7; i++) {
  const model = MODELS[i % MODELS.length];
  const stream = i % 2 === 0;
  const r = await chat({ model, stream, messages: [{ role: 'user', content: '演示请求 ' + i }] });
  if (stream) await r.text();
}
await fetch(base + '/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': c1Token }, body: JSON.stringify({ model: 'glm/glm-5.2', max_tokens: 500, messages: [{ role: 'user', content: 'anthropic 演示' }] }) });
await chat({ model: 'deepseek/deepseek-v4-flash', messages: [{ role: 'user', content: '直通' }] }, 'user_demo_go_plan_0001');
await chat({ model: 'm', messages: [{ role: 'user', content: 'bad key' }] }, 'sk-ccp-invalid0000000000000000000000ff'); // 401

console.log(`DEMO READY  base=${base}  adminToken=${DEMO_ADMIN_TOKEN}  clientKey=${c1Token}`);
console.log('按 Ctrl+C 结束');
process.on('SIGINT', () => { child.kill(); upstream.close(); process.exit(0); });
setInterval(() => {}, 1 << 30);
