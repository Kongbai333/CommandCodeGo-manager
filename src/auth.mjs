// 鉴权接缝(Step 2.2,PLAN D5):四个 handler 的统一密钥解析入口。
// 优先级:① sk-ccp-* 客户端 key(哈希验证 → 绑定的上游 key)
//        ② user_* 直通(参考项目的用法,受 allowDirectUpstreamKey 开关)
//        ③ config.apiKey 兜底
// 会话与设备指纹始终按**上游 key** 隔离(与参考实现一致);直通记为 unmanaged。
// getApiKey 为参考原实现(user_* 提取器),行为逐字保留。
import { CFG } from './config.mjs';
import { verifyClientKey, getUpstreamKeyById, touchUpstreamKey, listUpstreamKeys } from './store/keys.mjs';

function getApiKey(headers) {
  // Try Authorization: Bearer header (OpenAI SDK style)
  const auth = headers['authorization'] || headers['Authorization'] || '';
  if (auth.startsWith('Bearer ')) {
    const match = auth.slice(7).match(/user_[a-zA-Z0-9_-]+/);
    if (match) return match[0];
  }
  // Fall back to x-api-key header (Anthropic SDK style)
  const xKey = headers['x-api-key'] || headers['X-Api-Key'] || '';
  if (xKey) {
    const match = xKey.match(/user_[a-zA-Z0-9_-]+/);
    if (match) return match[0];
  }
  return null;
}

const AUTH_ERRORS = {
  invalid_client_key: 'Invalid or disabled client key (sk-ccp-*)',
  upstream_disabled: 'The upstream key bound to this client key is missing or disabled',
  direct_disabled: 'Direct upstream keys (user_*) are disabled on this proxy; use a client key (sk-ccp-*)',
};

export function authErrorMessage(error) {
  return AUTH_ERRORS[error] ?? 'Authentication failed';
}

/**
 * 解析请求头 → 上游密钥上下文。
 * options.skipUpstreamId:轮转时排除指定上游密钥(额度耗尽重试用)。
 * 返回:
 *   null                          —— 请求未携带任何凭据(由调用方决定 401 或回落)
 *   { error: 'invalid_client_key' | 'upstream_disabled' | 'direct_disabled' } —— 401
 *   { apiKey, mode, clientKeyId, clientKeyName, upstreamKeyId, rotated } —— 命中
 *     mode: 'client'(经客户端 key)| 'direct'(user_* 直通,unmanaged)| 'config'(兜底)
 *     rotated: 绑定的上游密钥不可用(停用/额度耗尽)时自动切到了其他启用密钥(H5)
 */
export async function resolveUpstreamKey(headers, options = {}) {
  const bearer = (headers['authorization'] || '').startsWith('Bearer ')
    ? headers['authorization'].slice(7) : '';
  const token = bearer || headers['x-api-key'] || '';

  // ① 客户端 key
  if (token.startsWith('sk-ccp-')) {
    const client = await verifyClientKey(token);
    if (!client) return { error: 'invalid_client_key' };
    let upstream = await getUpstreamKeyById(client.upstream_key_id);
    let rotated = false;
    // H5 额度耗尽自动轮转:绑定密钥不可用(active 才可用,exhausted/disabled 均不可)
    // 或被要求跳过时,回落到其他启用中的上游密钥(按 id 顺序);绑定优先、耗尽才切
    if (!upstream || (options.skipUpstreamId && upstream.id === options.skipUpstreamId)) {
      let fallback = null;
      for (const k of await listUpstreamKeys()) {
        if (k.status !== 'active' || k.id === options.skipUpstreamId) continue;
        const full = await getUpstreamKeyById(k.id);
        if (full) { fallback = full; break; }
      }
      if (!fallback) return { error: 'upstream_disabled' };
      upstream = fallback;
      rotated = true;
    }
    await touchUpstreamKey(upstream.id);
    return { apiKey: upstream.api_key, mode: 'client', clientKeyId: client.id, clientKeyName: client.name, upstreamKeyId: upstream.id, rotated };
  }

  // ② user_* 直通
  const direct = getApiKey(headers);
  if (direct) {
    if (!CFG.allowDirectUpstreamKey) return { error: 'direct_disabled' };
    return { apiKey: direct, mode: 'direct', clientKeyId: null, clientKeyName: null, upstreamKeyId: null };
  }

  // ③ config 兜底(部署在受信环境时可用)
  if (CFG.apiKey) {
    return { apiKey: CFG.apiKey, mode: 'config', clientKeyId: null, clientKeyName: null, upstreamKeyId: null };
  }

  return null;
}

export { getApiKey };
