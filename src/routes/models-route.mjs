// 派生自 MAXeaglet/commandcode-proxy(MIT,基线 9bdfafc)的单文件 proxy.mjs —— 纯移动拆分,实现与原注释逐字保留。
import { resolveUpstreamKey } from '../auth.mjs';
import { sendJSON } from '../http/respond.mjs';
import { fetchModels, MODELS } from '../protocol/models.mjs';
import { nowUnix } from '../util.mjs';
import { instrumentRequest } from '../telemetry.mjs';
async function handleModels(req, res) {
  instrumentRequest(req, res, '/v1/models');
  const auth = await resolveUpstreamKey(req.headers);
  req.ccpAuth = auth;
  // 无凭据/凭据无效 → null:回落静态模型列表(保持参考实现的 keyless 行为)
  const apiKey = auth && !auth.error ? auth.apiKey : null;
  const models = await fetchModels(apiKey);
  const now = nowUnix();
  // plan(最低套餐)只在静态权威清单里有,动态列表不标注
  const planOf = new Map(MODELS.map(m => [m.id, m.plan]));
  sendJSON(res, 200, {
    object: 'list',
    data: models.map(m => ({
      id: m.id,
      object: 'model',
      created: now,
      owned_by: 'command-code',
      plan: planOf.get(m.id) ?? null,
    })),
  });
}

export { handleModels };
