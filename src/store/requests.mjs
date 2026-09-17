// 请求日志:插入 + 分页过滤查询。不落消息正文(PLAN D5:隐私)。
import { getDb } from './db.mjs';

export async function insertRequest(rec) {
  const db = getDb();
  if (!db) return;
  db.prepare(`
    INSERT INTO requests (ts, endpoint, proxy_key, upstream_key_id, model, status_code, stream,
      duration_ms, input_tokens, output_tokens, cached_tokens, finish_reason, error_type, client_disconnected)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      rec.ts ?? Date.now(), rec.endpoint ?? '', rec.proxyKey ?? null, rec.upstreamKeyId ?? null,
      rec.model ?? null, rec.statusCode ?? null, rec.stream ? 1 : 0,
      rec.durationMs ?? null, rec.inputTokens ?? 0, rec.outputTokens ?? 0, rec.cachedTokens ?? 0,
      rec.finishReason ?? null, rec.errorType ?? null, rec.clientDisconnected ? 1 : 0,
    );
}

/**
 * 聚合统计(overview 用):自 ts 起的请求数/错误数/token 总量。
 */
export async function summarizeSince(ts) {
  const db = getDb();
  if (!db) return { requests: 0, errors: 0, inputTokens: 0, outputTokens: 0, cachedTokens: 0 };
  const r = db.prepare(`
    SELECT COUNT(*) AS requests,
      COALESCE(SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END), 0) AS errors,
      COALESCE(SUM(input_tokens), 0) AS inputTokens,
      COALESCE(SUM(output_tokens), 0) AS outputTokens,
      COALESCE(SUM(cached_tokens), 0) AS cachedTokens
    FROM requests WHERE ts >= ?`).get(ts);
  return r;
}
export async function listRequests(filter = {}) {
  const db = getDb();
  if (!db) return { rows: [], total: 0 };
  const where = [];
  const args = [];
  if (filter.endpoint) { where.push('endpoint = ?'); args.push(filter.endpoint); }
  if (filter.statusCode) { where.push('status_code = ?'); args.push(filter.statusCode); }
  if (filter.keyId) { where.push('upstream_key_id = ?'); args.push(filter.keyId); }
  if (filter.fromTs) { where.push('ts >= ?'); args.push(filter.fromTs); }
  if (filter.toTs) { where.push('ts <= ?'); args.push(filter.toTs); }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = db.prepare(`SELECT COUNT(*) AS n FROM requests ${whereSql}`).get(...args).n;
  const limit = Math.min(Math.max(1, Number(filter.limit) || 50), 500);
  const offset = Math.max(0, Number(filter.offset) || 0);
  const rows = db.prepare(`SELECT * FROM requests ${whereSql} ORDER BY ts DESC, id DESC LIMIT ? OFFSET ?`)
    .all(...args, limit, offset);
  return { rows, total };
}
