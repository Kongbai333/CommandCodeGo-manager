// 派生自 MAXeaglet/commandcode-proxy(MIT,基线 9bdfafc)的单文件 proxy.mjs —— 纯移动拆分,实现与原注释逐字保留。
// 请求体大小上限：默认 100MB，可用环境变量 CC_MAX_BODY_MB 覆盖（正整数，单位 MB）
// ⚠️ 内存特性（issue #20 实测）：请求体在转发到上游前会同时存在多份副本 ——
//    chunks[] / Buffer.concat / utf8 字符串 / JSON.parse 对象树 / buildCcRequest 重建对象树 / JSON.stringify 序列化体。
//    实测峰值 ≈ body 大小 × 5.1~7.4（7MB→+52MB，20MB→+116MB；而 413 拒绝路径只要 ×1.05）。
//    故 100MB 上限意味着「单个请求」最坏可吃 ~550MB，且该上限是每请求的、不是全局的。
//    公网/多用户部署请在反向代理层同时限制 body 大小与在途请求数（见 README「内存与部署」）。
const MAX_BODY_SIZE = (() => {
  const mb = Number.parseInt(process.env.CC_MAX_BODY_MB ?? '', 10);
  return Number.isFinite(mb) && mb > 0 ? mb * 1024 * 1024 : 100 * 1024 * 1024;
})();
// 上游读空闲超时（issue #19）：只计「reader.read() 的等待」，每收到一个 chunk 重置，
// 不是整个请求的总时长。默认值保持不变（30s / 90s），可用环境变量覆盖 ——
// 官方 CLI 对上游没有任何 idle timeout（反编译 command-code@1.50.0 已验证，
// createApiClient 调用点均未传 timeout），合法的长思考停顿可达数百秒，
// 遇到推理模型被 30s 误杀 / 触发 429 重试放大时，调大这两个值即可。
const STREAM_IDLE_TIMEOUT_MS = (() => {
  const ms = Number.parseInt(process.env.CC_STREAM_IDLE_MS ?? '', 10);
  return Number.isFinite(ms) && ms > 0 ? ms : 30000;   // 默认 30s — 流式无新数据中断
})();
const NONSTREAM_IDLE_TIMEOUT_MS = (() => {
  const ms = Number.parseInt(process.env.CC_NONSTREAM_IDLE_MS ?? '', 10);
  return Number.isFinite(ms) && ms > 0 ? ms : 90000;   // 默认 90s — 非流式超时更宽容
})();

// 客户端「僵死」保护：既不读也不断开时，该请求会连带上游连接一直挂着（背压修复后的残留）。
// 实测残留在途成本约 5MB/连接 —— 有界、不泄漏、断开即回收，但连接数本身无上限。
// 默认 0 = 禁用，保持既有行为不变：僵死客户端与「卡在工具执行的合法客户端」在协议层无法
// 区分，而官方 CLI 对上游没有任何 idle timeout（issue #19），贸然加超时会误杀健康请求。
// 在途请求上限（可选，默认关闭）。项目定位是纯反代层，并发控制属于下游（nginx
// limit_conn，per-IP / per-key）；本项仅为「不挂反代裸跑」的场景提供一个可选的
// 进程内全局兜底，不替代下游方案，也不感知客户端身份。
// 内存 = 在途数 × (0.13MB + 5.5 × body_MB)：body 上限只管住单请求量级，乘数由本项封顶。
// 超限返回 503 + Retry-After（SDK 会自行退避重试），而不是放任进程被 OOM 杀掉。
// 默认 0 = 关闭，不限制并发（既有的反代层定位不变，行为零变化）；需要时按需开启：
//   CC_MAX_INFLIGHT=32 npm start
// 注意：body 上限只管住单请求量级，乘数由本项封顶。默认 body 上限 100MB 时，
// N × 最坏 550MB —— 要硬性内存上界需同时下调 CC_MAX_BODY_MB。
const MAX_INFLIGHT = (() => {
  const n = Number.parseInt(process.env.CC_MAX_INFLIGHT ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : 0;            // 默认 0 = 不限
})();
const CLIENT_DRAIN_TIMEOUT_MS = (() => {
  const ms = Number.parseInt(process.env.CC_CLIENT_DRAIN_TIMEOUT_MS ?? '', 10);
  return Number.isFinite(ms) && ms > 0 ? ms : 0;
})();

export { MAX_BODY_SIZE, STREAM_IDLE_TIMEOUT_MS, NONSTREAM_IDLE_TIMEOUT_MS, MAX_INFLIGHT, CLIENT_DRAIN_TIMEOUT_MS };
