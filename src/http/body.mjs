// 派生自 MAXeaglet/commandcode-proxy(MIT,基线 9bdfafc)的单文件 proxy.mjs —— 纯移动拆分,实现与原注释逐字保留。
import { MAX_BODY_SIZE } from '../limits.mjs';
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalSize = 0;
    let settled = false;
    let drained = 0;
    // 413 拒绝后转入排空模式：继续读取并丢弃剩余请求体，保持 keep-alive 连接可复用，
    // 让客户端明确收到 413 而不是 Connection reset（issue #7）。
    // 但若客户端无视 413 持续上传超过 DRAIN_LIMIT，则强制掐断，不无限吞带宽。
    const DRAIN_LIMIT = 32 * 1024 * 1024;
    req.on('data', c => {
      if (settled) {
        drained += c.length;
        if (drained > DRAIN_LIMIT) { try { req.destroy(); } catch {} }
        return;
      }
      totalSize += c.length;
      if (totalSize > MAX_BODY_SIZE) {
        settled = true;
        chunks.length = 0;
        const mb = Math.round(MAX_BODY_SIZE / 1024 / 1024);
        const err = new Error(`Request body exceeds ${mb}MB limit`);
        err.statusCode = 413;
        reject(err);
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
      catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', e => { if (!settled) { settled = true; reject(e); } });
  });
}

export { readBody };
