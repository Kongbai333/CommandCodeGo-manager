// 额度耗尽自动轮转(H5):仅当上游明确返回 402(payment required,额度用尽)时,
// 把该上游密钥标记为 exhausted 并换下一把启用中的密钥重试一次。
// 429 等瞬态限速**不**轮转(换 key=换设备指纹,只在确属额度耗尽时才值得);
// 每把密钥独立设备指纹/会话的既有设计保证了轮转后的形态自洽。
import { ensureInitialized } from './init.mjs';
import { forwardToCC } from './upstream.mjs';
import { resolveUpstreamKey } from '../auth.mjs';
import { setUpstreamKeyStatus } from '../store/keys.mjs';
import { log } from '../log.mjs';

/**
 * 带 402 轮转的转发:ensureInitialized + forwardToCC 的统一入口。
 * 返回 { response, auth } —— auth 是实际使用的密钥上下文(轮转后 telemetry 按它归因)。
 */
export async function forwardWithRotation(auth, headers, ccBody, signal, promptCacheKey) {
  let current = auth;
  for (let attempt = 0; ; attempt++) {
    await ensureInitialized(current.apiKey, signal);
    const response = await forwardToCC(ccBody, current.apiKey, headers, signal, promptCacheKey);
    if (response.status !== 402 || current.mode !== 'client' || attempt > 0) {
      return { response, auth: current };
    }
    // 额度耗尽:标记本密钥,尝试换下一把(仅客户端密钥模式;直通/config 不轮转)
    log('warn', 'Upstream key exhausted (402), rotating', { upstreamKeyId: current.upstreamKeyId });
    await setUpstreamKeyStatus(current.upstreamKeyId, 'exhausted');
    const next = await resolveUpstreamKey(headers, { skipUpstreamId: current.upstreamKeyId });
    if (!next || next.error || next.upstreamKeyId === current.upstreamKeyId) {
      return { response, auth: current }; // 无可轮转密钥:按原语义返回(402 → 429)
    }
    log('info', 'Rotated to next upstream key', { from: current.upstreamKeyId, to: next.upstreamKeyId });
    current = next;
  }
}
