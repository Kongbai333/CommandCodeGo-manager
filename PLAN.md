# CommandCodeGo-manager 开发计划

> **执行状态(2026-09-17,用户第三轮反馈 H1~H5)**:① **取消 Admin Token**:管理界面免登录
> (API 仅回环监听 + 跨站 Origin 修改类请求 403 防护;登录页/轮换卡/ticket/SSE 票据/限速全链路移除,
> adminTokenHash 键仅为旧配置兼容保留)。② 桌面窗口可拖动:顶栏 WebkitAppRegion drag 区
> (mac hiddenInset),交互控件 no-drag。③ 布局:StatCard unit 移至标签行(value 大字不再换行)、
> 移除协议版本/协议漂移显示(用户要求,drift 检测仍在后台日志)。④ 模型:内置清单重建为
> command-code@1.54.2 包内权威目录(70 个,含最低套餐 plan 标注,/v1/models 返回 plan);
> 「一键刷新」= POST /admin/api/models/refresh(逐把启用密钥试探动态列表,Go 套餐 403 时
> 回落内置清单并说明)。⑤ **多账户 + 额度耗尽自动轮转**(推翻 ultrabrain U2 保守结论,按用户
> 要求实现保守版):绑定优先;上游 402(payment required)→ 标记 exhausted + 自动切下一把启用
> 密钥当次重试(forwardWithRotation,三端点统一);429 瞬态不轮转;每密钥独立指纹/会话;
> 密钥页三态(启用/停用/额度耗尽)与「重新启用」。CLI 多账户导入 = 切换 cmd login 后再次一键导入。
> 测试 91/91(admin 测试按免 token 重写 + 4 个轮转回归;期间修复:auth 测试曾误改测试进程库、
> rotation 测试顶层 kill 自杀 bug)。全平台安装包重打包,打包版 GUI 实测窗口直达主界面。

> **执行状态(2026-09-17,用户第二轮反馈 G1~G4)**:① 图标边缘白线(离屏渲染伪影)——改为大画布
> 内收 + capturePage 裁剪,成品四边 0 白像素(像素级验证);② **Go 订阅无 key 问题的正解**(调研
> 结论:CLI 登录后持有 user_ key 存 ~/.commandcode/auth.json,仅 /alpha/generate 可用而本代理恰走此
> 端点,故 Go 订阅天然可用)——新增「CLI 登录一键导入」:admin GET /admin/api/cc-cli 检测(深度遍历
> auth.json 提取 user_*、只回掩码)+ POST /cc-cli/import 导入(按 key 查重),密钥页显示导入横幅、
> 空态引导改为 CLI 路径说明;③ 按用户要求移除全部 Docker 内容(文件/README/设置页文案)。
> 验证:88/88 测试(新增 cc-cli 检测/导入/查重/未安装 4 组断言);打包版 smoke 通过;
> 浏览器实测密钥页横幅与一键导入;全平台安装包重打包。

> **执行状态(2026-09-17,用户实测反馈修复 F1~F5)**:桌面版实测后按反馈完成四项改进——
> ① 桌面免登录:主进程读 userData/admin-token.txt 经 URL 注入自动登录(模块加载期同步抓取,
> 避开 Router Navigate 抢先重写 URL 的时序),首启弹「设置自己的密钥」引导;设置页轮换 token
> 时服务端同步重写桌面 token 文件、前端同步本地会话,形成闭环;浏览器直接访问仍需密钥(安全不降级)。
> ② 双主题:亮色为默认(浅灰蓝底+白卡片+深 teal),暗色可切(顶栏按钮),首帧前恢复选择防闪烁;
> 图表配色全部改读设计 token(echartsBase() 随主题生成),亮色次要文字对比度 ≥4.5:1。
> ③ 点击反馈:按钮/Tabs/chip 按压缩放+变暗、hover 过渡,Dialog 弹入、Toast 上滑动画。
> ④ 新图标:teal→蓝渐变底+白色双向箭头(协议互转语义),Electron 离屏渲染 SVG。
> 顺带修复三个真 bug:adminToken 轮换被 delete patch.adminTokenHash 误杀(补回归测试);
> 桌面 app 无法退出(close preventDefault 拦截了 quit 流程,before-quit 先置 isQuitting);
> 亮色主题对比度不足。验证:86/86 测试全绿;CDP 实测窗口直接落在仪表盘(免登录)、
> SIGTERM 优雅退出(服务子进程随之停止);全平台安装包重打包并 smoke 通过。

> **执行状态(2026-09-17,含桌面版)**:命令行/Web 版全部步骤完成后,应用户要求追加
> **Phase D 桌面版(macOS + Windows)**:Electron 37 壳(内嵌 Node 22.21,`node:sqlite` 实测可用),
> 服务以子进程(`ELECTRON_RUN_AS_NODE` 运行 esbuild 单文件 bundle,与命令行版同一产物、零重构)方式运行;
> 原生窗口承载管理界面、托盘常驻(关窗后台运行)、首启 admin token 预生成(弹窗 + 明文存
> userData/admin-token.txt,权限 600)、端口占用自动扫描、单实例锁、`--smoke` 无窗口冒烟模式。
> 产物(mac/win 双架构 dmg/zip/nsis/portable,位于 release/):mac arm64+x64 dmg、
> win x64+arm64 Setup/Portable 及双架构合并安装器;`desktop-release.yml` CI 在双平台原生构建。
> 验证:打包版 .app `--smoke` 通过;GUI 实测(CDP 证实窗口加载登录页、服务 200、日志零错误);
> 首启 token 引导实测。全量测试 85/85 保持绿(服务端零改动)。

> **执行状态(2026-09-16)**:全部步骤已执行完毕。测试 85/85 全绿(计划要求的用例矩阵超额完成);
> 验收清单第 1/2/4/5/6 条通过,第 3 条(真实 `user_*` key 走真实 harness)因无真实 key 以 mock 上游
> 替代验证,待用户提供 key 后补测。遗留:looker 视觉截图评审与 code-reviewer 子代理复核因当日
> 计划配额限制未执行(截图已留档 `/tmp/ccp-shots/`),Docker 镜像构建因本机无 docker 未实跑。
> 后两项已于 09-17 由主会话补齐:程序化视觉审计(修复对比度/点击区)+ 逐行代码复核
> (修复 SSE 401 重连、adminTokenHash 覆盖、时区口径)。
> 执行差异记录:① Step 1.2 拆分新增 `src/protocol/keystate.mjs`(解循环依赖)与 `src/paths.mjs`
> (bundle 路径基座);② health 探活端点不记入请求日志(避免刷统计,业务四端点全记);
> ③ usage_daily 的 key_id 以哨兵 0 表示直通(SQLite 主键 NULL 不相等);④ 天粒度改本地时区口径。

> 由 planner 产出、ultrabrain 复核的分步计划。执行过程中以本文件为单一事实源。
> 参考实现(规格书):/tmp/commandcode-proxy-ref(MIT,vendored 基线 commit `9bdfafc`)
> `$ROOT` = 本目录。全程不做 git 操作。

## 1. 目标

构建基于 Node.js 的 Command Code 反向代理多平台软件:把 Command Code Go 订阅反代为 OpenAI(`/v1/chat/completions`、`/v1/responses`)与 Anthropic(`/v1/messages`)兼容端点供任意 harness 使用,协议行为与参考实现逐项对齐,自带美观中文 Web 管理界面(仪表盘/实时日志/用量/模型/密钥/设置),经 Docker 镜像与 npm/单文件包覆盖 macOS/Windows/Linux。

**验收清单**:
1. `npm test` 全绿——参考 wire 级测试(stream-end、connection-lifecycle)+ 新增鉴权/统计/admin/加固测试,全走 mock 上游,无需真实 key。
2. `node server.mjs` 启动后:`/health` 200;`/v1/models` 返回列表;`/` 返回 Web UI;无 key 请求 `/v1/chat/completions` 得 401。
3. 配置真实 `user_*` key 后,curl 与至少一个真实 harness(ZCode 或 Claude Code,经 `ANTHROPIC_BASE_URL`/`ANTHROPIC_AUTH_TOKEN`)完成流式对话+工具调用,界面实时日志与用量图表可见该请求。(无真实 key 时以 mock 上游替代并注明)
4. 自有客户端 key(`sk-ccp-*`)可创建/吊销,凭其调三端点;`user_*` 直通模式可关。
5. 管理界面默认仅监听 `127.0.0.1`,admin token 首启生成;数据落 `data/`(可被 Docker 卷挂载)。
6. `Dockerfile`+`docker-compose.yml`+GitHub Actions workflow 就绪(本机无 docker,构建验证延后)。

## 2. 架构决策

- **D1 技术栈**:Node.js ≥22.5(ESM)+ 零运行时依赖。参考实现 3341 行身经百战(429 语义、finishReason 规范化、usage 换算、背压、空闲看门狗、断连中止),fork 改造保 wire 行为逐字节保真。协议层纪律:**移植+保真,禁止自由发挥**。
- **D2 与参考关系**:fork-and-extend,非重写。协议核心按模块拆分自 proxy.mjs,保留 MIT 声明(`LICENSE`(本项目 MIT)+ `NOTICE`(派生自 MAXeaglet/commandcode-proxy));行为扩展只经明确接缝注入(密钥解析、请求记录钩子)。
- **D3 Web UI**:Vite + React 18 + TypeScript + Tailwind v4 + ECharts,构建产物输出 `public/` 由服务进程静态托管;零 CDN 运行时依赖(字体自托管 woff2,图标 lucide-react)。中文界面,暗色开发者工具风(左侧导航+顶栏状态+统计卡+图表)。
- **D4 持久化**:`node:sqlite`(内置)单文件库 `data/ccp.db`;引导配置 `data/config.json`。表:`upstream_keys`(明文存 user_* key——上游调用必需,README 声明取舍,目录权限 600)、`client_keys`(只存 sha256 哈希+前缀)、`requests`、`usage_daily`、`settings`。日志保留 30 天可配。Store 层接口抽象,可降级 JSON 落盘。
- **D5 认证与安全**:客户端 key `sk-ccp-<32hex>`(DB 存哈希,创建时一次性明文展示,显式绑定一枚上游 key);`user_*` 直通模式(config 开关,默认开,兼容参考用法);admin token 首启生成(打印控制台+存哈希),`/admin/api/*` 校验 `X-Admin-Token`,登录失败 5 次锁 60s;服务器默认监听 `127.0.0.1`(Docker 内 `HOST=0.0.0.0` 覆盖);日志与 DB 不落明文 key。

**ultrabrain 决议**(已采纳):
- **U1**:维持「Docker 镜像(主)+ npm 包/单文件 bundle(需系统 Node)」交付,**不做**真单二进制(否决 SEA 与 Go 重写;bun compile 列为后续可选,需先过 node:sqlite 冒烟)。
- **U2**:**不做**自动 key 轮换/池化(风控:换 key=换设备指纹,上游视为可疑;显式绑定是按 key 归因用量的前提)。存储 schema 按「绑定表+key 状态表」设计以便日后免迁移;402/429 原样透传(Retry-After)交给 SDK 重试;**协议漂移告警(proxy.mjs 201-217 的 drift 检测)必须接到 Web 界面显式展示**。

## 3. 分步计划

依赖序:0.1 → 1.1–1.4 → 2.1–2.5 → 3.1 → (3.2 ∥ 3.3 ∥ 3.4) → 3.5 → (4.1 ∥ 4.2) → 4.3 → 5.1 → 5.2

### Phase 0 — 脚手架

**Step 0.1(主会话)** 产出:`package.json`(type:module,engines node>=22.5,scripts:start/dev/test/build:web/bundle)、`LICENSE`、`NOTICE`、`.gitignore`(node_modules/、data/、web/dist/、dist/、*.log)、`config.default.json`、`server.mjs` 空壳、目录 `src/ test/ web/ public/ data/`、`README.md` 骨架。要点:`CCP_DATA_DIR` 环境变量可覆盖数据目录(默认 `$ROOT/data`)。验收:`node server.mjs` 打印启动信息退出;node≥22.5 检查。

### Phase 1 — 协议核心移植(保真基线)

**Step 1.1(主会话)** 原样 vendor 参考实现并让测试全绿。产出:`src/legacy/proxy.mjs`(复制自参考,文件头加派生声明,配置支持 `CCP_DATA_DIR`/`CC_API_BASE` env)、`test/helpers.mjs`、`test/stream-end.test.mjs`、`test/connection-lifecycle.test.mjs`(移植自参考,mock 上游+loopback)。零协议改动。验收:`npm test` 全过。

**Step 1.2(主会话)** 模块拆分(纯移动重构,测试保持全绿)。产出 `src/protocol/`(fingerprint/session/init/envelope/upstream/models)、`src/http/`(body/drain/idle)、`src/routes/`(chat/messages/responses/models-route/server)。文件头保留 MIT 派生注释与原中文注释;零逻辑改动;删 `src/legacy/proxy.mjs`。验收:`npm test` 全绿。

**Step 1.3(主会话)** 入口与配置层。产出:`src/config.mjs`(默认值+`data/config.json` 读写+env 覆写;沿用参考全部键,新增 dataDir/adminTokenHash/allowDirectUpstreamKey(默认 true)/logRetentionDays(30)/listenHost 默认 127.0.0.1)、`src/log.mjs`(分级+文件输出;不落 key/错误 body/stack)、改造 `server.mjs` 为真入口。验收:临时数据目录起服务,`curl /health` OK;空 body 无 key POST `/v1/chat/completions` 得 401;`npm test` 全绿。

**Step 1.4(主会话)** 特征化测试。产出:`test/wire-contract.test.mjs`(mock 上游断言信封:键序、threadId UUID 门控、system 块拼接、tools 空数组也下发、image_url→CC image、tool_result 次序、finishReason 全家族映射、零输出→429、无 finish→502、402→429)。验收:用例数 ≥20,全绿。

### Phase 2 — 密钥/持久化/管理 API

**Step 2.1(主会话)** SQLite 存储层。产出:`src/store/db.mjs`(建库/迁移/定时清理)、`src/store/keys.mjs`(upstream+client keys CRUD;`sk-ccp-`+randomBytes(16)hex,哈希存储;**按 ultrabrain:绑定表+key 状态表设计**)、`src/store/requests.mjs`(插入/分页过滤)、`src/store/usage.mjs`(upsert+聚合)。接口全 async;DB=`{dataDir}/ccp.db`;失败降级内存+错误日志。验收:`test/store.test.mjs`(临时目录 CRUD→重开数据仍在)。

**Step 2.2(主会话)** 鉴权接缝(唯一行为改动点)。产出:`src/auth.mjs` `resolveUpstreamKey(headers,config,store)`:①`sk-ccp-*`→查哈希→返回绑定上游 key+记 last_used;②`user_*` 直通(受开关);③config 兜底;④401。改三个 handler 的 getApiKey 调用点。会话与指纹按**上游 key** 隔离;直通记为 unmanaged。验收:`test/auth.test.mjs`(sk-ccp 路由到绑定上游 key(mock 断言 Bearer 是 user_xxx)、吊销后 401、直通关掉后 401)。

**Step 2.3(主会话)** 请求记录+事件总线。产出:`src/telemetry.mjs`(in-memory pub/sub);handler 完成路径插 `recordRequest(ctx)`:时间戳/端点/proxy_key/上游 key 掩码/模型/状态码/流式/延迟/tokens/finish_reason/error_type/client_disconnected。记录全 try/catch;不落消息正文。验收:`test/telemetry.test.mjs`。

**Step 2.4(主会话)** Admin REST API。产出:`src/admin/api.mjs` 挂 `/admin/api/*`(中间件校验 `X-Admin-Token`,失败 5 次锁 60s)。端点:GET /overview(运行状态/今日请求/tokens/错误率/在途/版本/上游可达性/**协议漂移状态**)、GET /logs(分页+过滤)、GET /logs/stream(SSE 复用 telemetry 总线,心跳 ping;**一次性短票据支持 EventSource**)、GET /usage(from/to/groupBy)、upstream-keys CRUD(掩码;`?test=1` 探活)、client-keys(POST 一次性返回明文)、GET|PUT /settings。admin CORS 不再 `*`。验收:`test/admin-api.test.mjs` + curl 手测。

**Step 2.5(主会话)** 静态托管。产出:`src/static.mjs`(MIME+Cache-Control:index.html 不缓存,hash 资源 1 年;SPA fallback 仅非 `/v1`、非 `/admin/api` 路径)。验收:public/index.html 可访问。

### Phase 3 — Web UI

**Step 3.1(主会话)** 前端脚手架与设计系统。产出:`web/`(Vite+React18+TS+Tailwind v4;dev 代理 /admin/api 与 /v1 到 127.0.0.1:3050,build outDir=public/)、设计 token(暗色 #0f1115 层级、单一强调色、Inter+JetBrains Mono 自托管 woff2)、App Shell(左侧导航+顶栏状态条)、react-router、API client(X-Admin-Token+401 跳登录)、登录页、组件基件(Button/Card/Table/Badge/Dialog/Input/Tabs/Toast/空态/骨架屏)。验收:`npm run build:web` 成功;起服务见登录页,输入 token 进入空态 Shell。

**Step 3.2(quick-fixer,∥3.3/3.4)** 总览仪表盘+实时日志。产出:`web/src/pages/Dashboard.tsx`(统计卡:今日请求/总 tokens/错误率/活跃 key/在途/运行时长;ECharts 24h 请求与 token 双轴折线;最近 10 条请求表;上游状态灯)、`web/src/pages/Logs.tsx`(SSE 实时追加表+过滤器+行点击详情抽屉+滚动暂停开关)。SSE 断线自动重连;EventSource 用一次性短票据。验收:mock 造流量实时滚动;断线重连恢复。

**Step 3.3(quick-fixer,∥3.2/3.4)** 用量统计+模型列表。产出:`web/src/pages/Usage.tsx`(日粒度柱状/折线,key×模型下钻,input/cached/output 三段堆叠)、`web/src/pages/Models.tsx`(当前生效列表,标来源(动态/兜底),按厂商分组卡片,搜索,手动刷新)。验收:对齐 ccp.db 聚合;空数据漂亮空态。

**Step 3.4(quick-fixer,∥3.2/3.3)** 密钥管理+设置。产出:`web/src/pages/Keys.tsx`(两 Tab:上游 key——新增(名称/掩码输入/test 探活)/启停/删除二次确认;客户端 key——创建弹窗一次性展示 token+复制、绑定上游 key 下拉、启停/删除)、`web/src/pages/Settings.tsx`(分组表单:服务/上游/超时限制/安全;校验+「需重启生效」提示)。验收:创建上游 key→创建绑定客户端 key→curl 打通 mock 上游;删除后 401。

**Step 3.5(主会话)** UI 集成收尾。产出:全局打磨(加载态/错误边界/toast/响应式)、`npm run build` 脚本化。验收:走验收清单 2/3/4 条;浏览器逐页截图留档(交 looker 评审)。

### Phase 4 — 分发与文档

**Step 4.1(quick-fixer,∥4.2)** Docker 三件套+CI。产出:`Dockerfile`(node:22-alpine 多阶段:web build→拷 server.mjs/src/public/package.json→HOST=0.0.0.0→HEALTHCHECK /health,数据卷 /app/data)、`docker-compose.yml`(卷 ./data:/app/data)、`.dockerignore`、`.github/workflows/docker-publish.yml`(buildx linux/amd64+arm64 推 GHCR)。本机无 docker,只做文件+语法自检。

**Step 4.2(主会话,∥4.1)** npm 分发打包。产出:`scripts/bundle.mjs`(esbuild devDependency 打单文件 `dist/commandcode-proxy.mjs`,静态资源在 public/)+package.json `files` 白名单。验收:`npm run bundle && node dist/commandcode-proxy.mjs` 起 /health OK。

**Step 4.3(主会话,4.1/4.2 后)** 文档。产出:`README.md`(中文:简介/快速开始(裸 Node/Docker/npm)/config 与环境变量全表/三端点接入示例(cURL/OpenAI SDK/Claude Code ANTHROPIC_BASE_URL/ZCode/OpenCode)/管理界面截图/免责声明(逆向协议可能违反 ToS,账号风险自担;key 明文存储;内存放大与 nginx 建议))。验收:照文档干净目录可跑通。

### Phase 5 — 加固与验收

**Step 5.1(主会话)** 边缘与安全加固。产出:`test/hardening.test.mjs`:客户端流中断连(上游被 abort+日志标记)、背压(慢读客户端+小 maxBody)、413 排空、MAX_INFLIGHT 503、admin 限速锁、日志无明文 key(全库 grep)。验收:`npm test` 全绿;grep 无 key 泄漏。

**Step 5.2(主会话)** 端到端验收:跑第 1 节验收清单全部 6 条(第 3 条无真实 key 时以 mock 上游替代并注明)。

## 4. 关键风险

- **上游协议变更**:协议事实收敛 `src/protocol/upstream.mjs` 单点;移植参考 npm registry 漂移检测(24h 只告警)并接 UI;README 记录 vendored 基线 `9bdfafc`,可持续 diff 上游取修复。
- **移植引入流式 bug**:纪律「先 vendor 后拆分、测试永绿」;特征化测试覆盖 finishReason 家族/零输出/无 finish/usage 换算;原中文注释(含 issue 编号真机记录)一律保留作对照规格。
- **UI 耗时失控**:页面清单固定 7 页(登录/仪表盘/日志/用量/模型/密钥/设置)不许增;先设计系统后填页面;「美观」以截图评审为准。
- **工具链**:本机无 go/bun/pnpm/docker(有 Node 22.23);node:sqlite 22.x 有 ExperimentalWarning(无害,启动静默+README 注明);Docker 无法本地验证。
- **账号风控**:指纹/lifecycle/session 机制逐字移植(参考已对齐 CLI 1.53.1);不做自动轮换。
- **内存放大**:保留 `CC_MAX_BODY_MB`/`CC_MAX_INFLIGHT`/`CC_CLIENT_DRAIN_TIMEOUT_MS` 全部旋钮;README 移植 nginx 部署建议;SQLite 写入走异步遥测路径不阻塞流转发。
- **信息缺口**:`captured-requests/` 不在克隆中(协议事实以 proxy.mjs 注释与测试为准);真实上游 E2E 需用户提供 `user_*` key;Windows/Linux 实机不可用(代码层零平台 API 依赖,CI 矩阵延后);Docker 构建本机不可验证。

## 5. 不做清单

真单二进制分发(Go/bun compile/SEA,后续可选);上游多 key 智能池化与自动故障转移;多用户/团队/RBAC/配额计费;请求正文存储与会话回放;git init/commit/CI 实跑;i18n 框架;Windows 安装器/服务注册;实时 WebSocket(SSE 足够);协议自动化逆向工具;对参考项目未实现协议特性的顺手补全(以保真移植为纪律)。


## H7 视觉升级「美观大气」轮(2026-09-17)
- 用户反馈「界面简陋单调,不够美观大气」→ 全面视觉升级:
  - 品牌体系:brand2/violet/cyan2/rose 扩展色板;页面渐变底色;卡片 hover 轻浮起
  - StatCard:六色统计卡,渐变图标 44px,同色系深浅渐变(500→600,警示红橙降为 400→500),xl 3 列 / 2xl 6 列(修数字截断),数字 22px tabular-nums
  - AppShell:品牌渐变 logo、分组导航(监控/配置)、渐变激活条、每页大标题页头
  - 图表:ECharts 渐变柱 + 面积填充折线(紫,与青柱拉开色距),去 Y 轴名称防重叠
  - 主按钮渐变;阴影收敛;三轮远程视觉评审(截断→配色→终审「无必须修改项」)
- 验证:tsc 0 错;web 构建 ✓;91/91 测试;bundle 内嵌新产物;mac(dmg/zip×arm64/x64)+ win(setup/portable×x64/arm64)全部重打包;打包版 GUI 实测(:3050 服务 + 新 CSS hash 命中)后正常退出
