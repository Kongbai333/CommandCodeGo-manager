// 派生自 MAXeaglet/commandcode-proxy(MIT,基线 9bdfafc)的单文件 proxy.mjs —— 纯移动拆分,实现与原注释逐字保留。
import crypto from 'crypto';
import { CFG } from '../config.mjs';
import { log } from '../log.mjs';
import { CC_VERSION } from './upstream.mjs';
import { getOrCreateKeyState } from './keystate.mjs';

// ── 初始化预请求（fingerprint + lifecycle，首次 + 每 8h+2h 抖动） ────
const INIT_REFRESH_MS = 8 * 60 * 60 * 1000;    // 8h
const INIT_JITTER_MS  = 2 * 60 * 60 * 1000;    // 2h 抖动

async function ensureInitialized(apiKey, signal) {
  const state = getOrCreateKeyState(apiKey);
  const now = Date.now();
  if (now < state.nextInitAt) return;

  try {
    // 并行发两个预请求
    const headers = {
      'Content-Type': 'application/json',
      'x-cli-environment': 'production',
      'Authorization': `Bearer ${apiKey}`,
      'x-command-code-version': CC_VERSION,
      ...(CFG.zdr ? { 'x-cmd-zdr': '1' } : {}),
    };
    const fingerprint = state.fingerprint || {};

    await Promise.all([
      fetch(`${CFG.apiBase}/alpha/fingerprint/record`, {
        method: 'POST', headers, signal,
        body: JSON.stringify(fingerprint),
      }).then(r => {
        state.fingerprintReport = { ts: Date.now(), ok: r.ok, ...(r.ok ? {} : { status: r.status }) };
        if (!r.ok) log('warn', 'Fingerprint record failed', { status: r.status });
        else log('info', 'Fingerprint recorded');
      }).catch(e => {
        if (e.name !== 'AbortError') {
          state.fingerprintReport = { ts: Date.now(), ok: false, error: e.message };
          log('warn', 'Fingerprint record error', { error: e.message });
        }
      }),

      fetch(`${CFG.apiBase}/alpha/lifecycle-events`, {
        method: 'POST', headers, signal,
        body: JSON.stringify({
          eventType: 'cli_session_exists',
          metadata: {
            sessionId: `sess_${crypto.randomBytes(8).toString('hex')}`,
            cliVersion: CC_VERSION,
            mode: CFG.cliSessionMode || 'interactive',
            os: `${fingerprint.components.platform}-${fingerprint.components.arch}`,
          },
        }),
      }).then(r => {
        state.lifecycleReport = { ts: Date.now(), ok: r.ok, ...(r.ok ? {} : { status: r.status }) };
        if (!r.ok) log('warn', 'Lifecycle event failed', { status: r.status });
        else log('info', 'Lifecycle event sent');
      }).catch(e => {
        if (e.name !== 'AbortError') {
          state.lifecycleReport = { ts: Date.now(), ok: false, error: e.message };
          log('warn', 'Lifecycle event error', { error: e.message });
        }
      }),
    ]);

    // 成功：8h + 2h 随机抖动
    const jitter = Math.floor(Math.random() * INIT_JITTER_MS);
    state.nextInitAt = Date.now() + INIT_REFRESH_MS + jitter;
    log('info', 'Fingerprint/lifecycle next refresh', { nextIn: `${(INIT_REFRESH_MS + jitter) / 3600000}h` });
  } catch (e) {
    if (e.name !== 'AbortError') log('warn', 'Fingerprint/lifecycle refresh error, will retry next request', { error: e.message });
  }
}

export { ensureInitialized };
