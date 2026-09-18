# ccgo-manager 镜像

给 [learningdog1/CommandCodeGo-manager](https://github.com/learningdog1/CommandCodeGo-manager) 做的 Docker 打包壳。

上游本身没有 Dockerfile（只有桌面版 / 裸 Node / 单文件 bundle 三种部署方式），这个仓库只做一件事：
**在 GitHub Actions 上把上游源码构建成镜像**，顺带导出一份离线 tar.gz 给 NAS 用。

## 用现成的

| 方式 | 地址 |
|---|---|
| GHCR（需要能连 ghcr.io） | `ghcr.io/kongbai333/ccgo-manager:latest` |
| 离线 tar.gz（国内推荐） | [Releases → image-latest](https://github.com/Kongbai333/ccgo-image/releases/tag/image-latest) |

NAS 上：

```bash
docker load -i ccgo-manager-amd64.tar.gz
docker compose up -d          # 用本仓库的 compose.yaml
```

然后打开 `http://<NAS 的 IP>:3050/`。

> GHCR 上的包首次推送后默认是 **private**，要在别的机器上匿名 `docker pull`，
> 需要去 GitHub 的 Packages 页面把它改成 public（Package settings → Change visibility）。

## 自己构建

```bash
docker build -t ccgo-manager:latest .
# 指定上游版本
docker build --build-arg UPSTREAM_REF=v0.1.3 -t ccgo-manager:v0.1.3 .
```

## 更新

上游更新后，在 Actions 页面点一次 `build-image` → `Run workflow` 即可（也可以等每周一的定时任务）。
想跟某个具体版本，`upstream_ref` 填 tag 或 commit SHA。

## 镜像里做了什么

- 多阶段构建：阶段 1 拉上游源码 + `npm run build:web` 产出 `public/`；阶段 2 只保留
  `server.mjs` / `src/` / `public/` / `package.json`，约 250MB（node:22-slim 打底）。
- 上游零运行时依赖（存储用内置 `node:sqlite`），所以最终镜像里没有 `node_modules`。
- `HOST=0.0.0.0`：上游默认监听 `127.0.0.1`，不改的话容器外连不上。
- `CCP_DATA_DIR=/data` + `VOLUME /data`：`config.json` 与 `ccp.db` 都在这里。
- 上游 commit SHA 写进镜像的 `/app/UPSTREAM_SHA`，方便对账。

## 两个必须知道的事

1. **管理界面没有登录鉴权。** 上游的设计是「只监听 127.0.0.1」当作唯一防线，README 里也写着
   「管理界面无需登录」。容器化之后这个前提就没了，所以**不要把这个端口映射到公网**。
   要在公网用，请自己在前面套一层带鉴权的反代。
2. **内存。** 上游默认 `CC_MAX_BODY_MB=100`，实测单个请求最坏可吃 ~550MB。
   多人/公网部署请同时下调 `CC_MAX_BODY_MB` 和 `CC_MAX_INFLIGHT`。

## 已知问题（上游，与本仓库无关）

- 在 **Windows** 上跑裸 Node 时，Web 界面会整站 404：`src/static.mjs` 用
  `normalize()` 处理路径后与含正斜杠的 `PUBLIC_DIR` 做 `startsWith` 比较，Windows 下
  `normalize` 会把分隔符转成 `\`，判断恒为 false。Linux/macOS（含本镜像）不受影响。
- README 里 `adminTokenHash` 的描述与实际行为不一致（代码注释标它「已废弃」，文档表格仍写「首启生成」）。

## 许可

上游是 MIT，本仓库只是构建脚本。协议层派生自 MAXeaglet/commandcode-proxy，详见上游 `NOTICE`。
