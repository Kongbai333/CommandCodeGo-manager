// 派生自 MAXeaglet/commandcode-proxy(MIT,基线 9bdfafc)的单文件 proxy.mjs —— Step 1.2 纯移动拆分,实现与原注释逐字保留。
import { CLIENT_DRAIN_TIMEOUT_MS } from '../limits.mjs';
import { log } from '../log.mjs';
// 下游背压：res.write() 返回 false 表示 socket 写缓冲已超 highWaterMark（消费者跟不上）。
// 忽略它会让整个上游流在内存中无界堆积 —— 客户端不读时 RSS 随上游流一起增长（issue #20）。
// 必须同时监听 close/error，否则客户端断连会让请求协程永久挂起。
// CLIENT_DRAIN_TIMEOUT_MS > 0 时额外加一道空闲看门狗：超时则 destroy 该响应，
// 由此触发既有的 res 'close' 处理器 → aborted=true → 中止 CC 上游，无需改动各调用点。
function waitDrain(res) {
  if (!res.writableNeedDrain) return Promise.resolve();
  return new Promise((resolve) => {
    let timer = null;
    const done = () => {
      res.off('drain', done); res.off('close', done); res.off('error', done);
      if (timer) { clearTimeout(timer); timer = null; }
      resolve();
    };
    res.once('drain', done); res.once('close', done); res.once('error', done);
    if (CLIENT_DRAIN_TIMEOUT_MS > 0) {
      timer = setTimeout(() => {
        log('warn', 'Client stalled on backpressure, dropping connection', {
          path: res.req?.url || '(unknown)',
          timeoutMs: CLIENT_DRAIN_TIMEOUT_MS,
          bufferedBytes: res.writableLength,
        });
        try { res.destroy(); } catch {}
        done();
      }, CLIENT_DRAIN_TIMEOUT_MS);
    }
  });
}

export { waitDrain };
