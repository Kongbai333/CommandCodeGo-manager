# syntax=docker/dockerfile:1
#
# CommandCodeGo-manager 的 Docker 打包（非官方）。
# 上游 https://github.com/learningdog1/CommandCodeGo-manager 本身不提供 Dockerfile，
# 因此本文件在构建时自行拉取上游源码。整个仓库只是一个打包壳，不含上游代码。
#
#   构建最新 main:   docker build -t ccgo-manager:latest .
#   构建指定版本:     docker build --build-arg UPSTREAM_REF=v0.1.3 -t ccgo-manager:v0.1.3 .
#   构建指定 commit:  docker build --build-arg UPSTREAM_REF=<sha> -t ccgo-manager:test .
#
# 上游要求 Node >= 22.5（用了内置 node:sqlite，无原生模块、零运行时依赖）。

ARG NODE_IMAGE=node:22-slim

# ── 阶段 1：拉取上游源码 + 构建 Web UI ────────────────────────────────
FROM ${NODE_IMAGE} AS build

ARG UPSTREAM_REPO=https://github.com/learningdog1/CommandCodeGo-manager.git
ARG UPSTREAM_REF=main

RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /src
# 完整 clone（上游仓库仅约 5MB），这样分支 / tag / commit SHA 三种 ref 都能 checkout。
# 不用 --depth 1：浅克隆对任意 SHA 不一定可用。
RUN git clone --quiet "${UPSTREAM_REPO}" /src \
 && git -C /src checkout --quiet "${UPSTREAM_REF}" \
 && git -C /src rev-parse HEAD > /upstream-sha \
 && rm -rf /src/.git

# Web UI → /src/public（web/vite.config.ts 里 outDir 是 '../public'）
# 与上游自己的 CI 一致，ci 失败时回退 install
RUN npm --prefix web ci || npm --prefix web install
RUN npm run build:web

# ── 阶段 2：运行时 ──────────────────────────────────────────────────
FROM ${NODE_IMAGE}

# HOST 必须显式改成 0.0.0.0：上游默认监听 127.0.0.1（作者为了不暴露管理界面刻意收紧），
# 容器里保持 127.0.0.1 的话端口映射出来也连不上。
# CCP_DATA_DIR 把 SQLite 库与 config.json 收到一个目录里，方便挂卷。
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3050 \
    CCP_DATA_DIR=/data

WORKDIR /app
# 运行时只需要这些：server.mjs + src/ + public/，package.json 用于管理界面读版本号。
# 上游零运行时依赖，不需要 node_modules。
COPY --from=build /src/server.mjs   ./server.mjs
COPY --from=build /src/package.json ./package.json
COPY --from=build /src/src          ./src
COPY --from=build /src/public       ./public
COPY --from=build /upstream-sha     ./UPSTREAM_SHA

RUN mkdir -p /data && chown -R node:node /data /app
USER node

EXPOSE 3050
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3050)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.mjs"]
