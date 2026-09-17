// 派生自 MAXeaglet/commandcode-proxy(MIT,基线 9bdfafc)的单文件 proxy.mjs —— 纯移动拆分,实现与原注释逐字保留。
// 上游读空闲看门狗：复用单个定时器，避免「每个 chunk 新建一个 setTimeout 且从不清理」。
// 实测每个待触发定时器滞留约 225B；稳态滞留 = 吞吐 × 超时窗口 × 每响应 chunk 数 × 225B
// （50 rps × 2000 chunk × 30s ≈ 644MB，非流式 90s 窗口约为其三倍）。
// arm() 用 refresh() 把窗口重置为「本轮 read 开始」，与原实现语义一致：超时只计 reader.read() 的等待。
function createIdleWatchdog(timeoutMs) {
  let rejectFn = null;
  const expired = new Promise((_, reject) => { rejectFn = reject; });
  expired.catch(() => {}); // 读循环退出后定时器才触发时，避免 unhandledRejection
  const timer = setTimeout(() => rejectFn(new Error('STREAM_IDLE_TIMEOUT')), timeoutMs);
  return {
    arm() { timer.refresh(); return expired; },
    dispose() { clearTimeout(timer); },
  };
}

export { createIdleWatchdog };
