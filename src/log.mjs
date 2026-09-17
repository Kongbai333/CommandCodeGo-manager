// 派生自 MAXeaglet/commandcode-proxy(MIT,基线 9bdfafc)的单文件 proxy.mjs —— Step 1.2 纯移动拆分,实现与原注释逐字保留。
import { appendFileSync } from 'fs';
import { CFG } from './config.mjs';
// ── 日志 ─────────────────────────────────────────────
function log(level, msg, data) {
  const line = `[${new Date().toISOString()}] [${level}] ${msg}${data ? ' ' + JSON.stringify(data) : ''}`;
  console.log(line);
  if (CFG.logFile) {
    try { appendFileSync(CFG.logFile, line + '\n', 'utf-8'); } catch {}
  }
}

// 把上游错误体摘要成单行，便于日志排查。
// 之前 CC API error 只记 status，不记 body —— 遇到 400 只能靠猜（问题来源见 hk_sji 排查）。
// 截断到 500 字符，避免异常大的 body 刷爆日志；同时压掉换行，保证一条日志一行。
function summarizeUpstreamError(text, limit = 500) {
  if (!text) return '';
  const flat = String(text).replace(/\s+/g, ' ').trim();
  return flat.length > limit ? flat.slice(0, limit) + '…(' + (flat.length - limit) + ' more)' : flat;
}

export { log, summarizeUpstreamError };
