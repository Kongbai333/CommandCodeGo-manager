// 模型列表(Phase 3.3):/v1/models 实时列表(业务端点,不走 admin 鉴权),厂商分组 + 搜索 + 点击复制。
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { refreshModels, type ModelItem } from '../api';
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Input, Loading, toast, fmtInt } from '../ui';

// 套餐徽标(Go 用户视角:go=可用,其余为更高套餐)
const PLAN_LABEL: Record<string, string> = { go: 'Go', pro: 'Pro', goat: 'GOAT', max: 'Max', team: 'Teams' };

// 厂商名:取 id 第一段('deepseek/xxx' → 'DeepSeek');无斜杠取品牌词首段('gpt-4o' → 'Gpt')
function vendorOf(id: string): string {
  const head = id.includes('/') ? id.slice(0, id.indexOf('/')) : (id.split('-')[0] || id);
  return head ? head.charAt(0).toUpperCase() + head.slice(1) : '其他';
}

function copyId(id: string) {
  if (!navigator.clipboard) { toast('err', '复制失败:剪贴板不可用'); return; }
  navigator.clipboard.writeText(id)
    .then(() => toast('ok', '已复制'))
    .catch(() => toast('err', '复制失败'));
}

export function Models() {
  const [models, setModels] = useState<ModelItem[] | null>(null); // null = 加载中
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch('/v1/models');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { data?: ModelItem[] };
      const list = Array.isArray(json?.data) ? json.data.filter(m => m && typeof m.id === 'string') : [];
      setModels(list);
      setFailed(null);
    } catch (e) {
      setModels([]);
      setFailed((e as Error).message || '加载失败');
      toast('err', `加载模型列表失败:${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // 一键刷新:先用启用的上游密钥试探动态列表(高套餐生效);Go 套餐回落内置权威清单并说明
  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const r = await refreshModels();
      if (r.source === 'upstream') toast('ok', `已从上游刷新模型列表(${r.count} 个)`);
      else toast('info', r.reason ?? `已展示内置清单(${r.count} 个)`);
      await load();
    } catch (e) {
      toast('err', `刷新失败:${(e as Error).message}`);
    }
  }, [load]);

  // 搜索过滤 + 厂商分组(组内按 id 排序,组间按厂商名排序)
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const map = new Map<string, ModelItem[]>();
    for (const m of (models ?? []).filter(m => !q || m.id.toLowerCase().includes(q))) {
      const v = vendorOf(m.id);
      const arr = map.get(v);
      if (arr) arr.push(m); else map.set(v, [m]);
    }
    return [...map.entries()]
      .map(([vendor, items]) => ({ vendor, items: items.sort((a, b) => a.id.localeCompare(b.id)) }))
      .sort((a, b) => a.vendor.localeCompare(b.vendor));
  }, [models, query]);
  const matched = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <div className="space-y-5">
      {/* ── 顶部:搜索 / 刷新 / 来源 ── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-txt3" />
          <Input className="pl-8" value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索模型 id…" />
        </div>
        <Button onClick={() => void refresh()} loading={busy}><RefreshCw size={14} />一键刷新</Button>
        <Badge kind="ok">当前生效</Badge>
        {models && (
          <span className="tnum ml-auto text-xs text-txt3">
            {query.trim() ? `匹配 ${matched} / ${models.length} 个模型` : `共 ${fmtInt(models.length)} 个模型 · ${groups.length} 个厂商`}
          </span>
        )}
      </div>

      {/* ── 分组列表 ── */}
      {models === null ? (
        <Card><Loading>加载模型列表…</Loading></Card>
      ) : failed ? (
        <Card><EmptyState title="模型列表加载失败" hint={`${failed},请点击「刷新」重试。`} /></Card>
      ) : models.length === 0 ? (
        <Card><EmptyState title="暂无模型" hint="上游未返回任何模型,请确认服务配置后刷新。" /></Card>
      ) : matched === 0 ? (
        <Card><EmptyState title="无匹配模型" hint={`没有 id 包含「${query.trim()}」的模型。`} /></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {groups.map(g => (
            <Card key={g.vendor}>
              <CardHeader title={g.vendor} extra={<Badge kind="accent">{g.items.length} 个模型</Badge>} />
              <CardBody>
                <div className="flex flex-wrap gap-2">
                  {g.items.map(m => (
                    <button key={m.id} onClick={() => copyId(m.id)} title="点击复制模型 id"
                      className="rounded border border-line bg-panel2 px-2 py-1 font-mono text-xs text-txt2 transition-all duration-150 hover:border-accent/50 hover:text-accent active:scale-95 active:brightness-95">
                      {m.id}
                      {m.plan && (
                        <span className={`ml-1.5 rounded px-1 py-px font-sans text-[9px] ${m.plan === 'go' ? 'bg-accent-dim text-accent' : 'bg-line text-txt3'}`}>
                          {PLAN_LABEL[m.plan] ?? m.plan}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
