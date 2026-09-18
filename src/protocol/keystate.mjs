// 派生自 MAXeaglet/commandcode-proxy(MIT,基线 9bdfafc)的单文件 proxy.mjs —— 纯移动拆分,实现与原注释逐字保留。
// 从原「初始化预请求」段拆出:该 Map 同时被 session 清理(过期时连带清指纹状态)与
// ensureInitialized 读写,独立成模块以避免 session→init→upstream→session 的循环依赖。
import { generateFingerprint } from './fingerprint.mjs';
import { log } from '../log.mjs';

// ── 每 Key 独立状态（fingerprint + 初始化节流） ──
// 每个 API Key 拥有自己的设备指纹和初始化定时器。
// fingerprintReport / lifecycleReport 记最近一次上报结果(供管理界面「设备指纹」页展示),
// createdAt 为该指纹(重)生成时间。
export const keyStateStore = new Map(); // apiKey → { fingerprint, nextInitAt, createdAt, fingerprintReport, lifecycleReport }

export function getOrCreateKeyState(apiKey) {
  let state = keyStateStore.get(apiKey);
  if (!state) {
    state = {
      fingerprint: generateFingerprint(apiKey),
      nextInitAt: 0,
      createdAt: Date.now(),
      fingerprintReport: null,   // { ts, ok, status?, error? }
      lifecycleReport: null,
    };
    keyStateStore.set(apiKey, state);
    log('info', 'Fingerprint generated for key', { keyPrefix: apiKey.slice(0, 8) });
  }
  return state;
}
