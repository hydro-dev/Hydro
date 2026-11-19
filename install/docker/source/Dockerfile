# syntax=docker/dockerfile:1.7
#
# 从本仓库源码构建 Hydro 后端镜像（内含已编译的前端静态资源）。
#
# 与 install/docker/backend/Dockerfile 的区别：
#   - 上面那个从 npm 安装发布版 hydrooj / @hydrooj/ui-default，不含本仓库的定制代码
#   - 这个用仓库源码 + 前端 production 构建产物，镜像里就是当前 commit 的真实代码
#
# 构建（上下文必须是仓库根目录，否则 COPY 不到 packages/、framework/）：
#   docker build -f install/docker/source/Dockerfile -t hgnuoj-backend:local .
#
# 国内网络可以换源：
#   docker build -f install/docker/source/Dockerfile \
#     --build-arg NPM_REGISTRY=https://registry.npmmirror.com \
#     --build-arg APT_MIRROR=mirrors.tuna.tsinghua.edu.cn \
#     -t hgnuoj-backend:local .

ARG NODE_IMAGE=node:22-bookworm

# ---------------------------------------------------------------- builder
FROM ${NODE_IMAGE} AS builder

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

WORKDIR /app

# MONGOMS_DISABLE_POSTINSTALL：mongodb-memory-server 只在测试里用，
# 它的 postinstall 默认要下载一份 mongod 二进制，镜像构建里不需要。
ENV CI=true \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    YARN_ENABLE_IMMUTABLE_INSTALLS=false \
    MONGOMS_DISABLE_POSTINSTALL=1

# 可选的国内镜像源；留空则使用官方源
ARG NPM_REGISTRY=
ARG APT_MIRROR=

RUN if [ -n "$APT_MIRROR" ]; then \
        if [ -f /etc/apt/sources.list.d/debian.sources ]; then \
            sed -i "s|deb.debian.org|${APT_MIRROR}|g; s|security.debian.org|${APT_MIRROR}/debian-security|g" /etc/apt/sources.list.d/debian.sources; \
        else \
            sed -i "s|deb.debian.org|${APT_MIRROR}|g" /etc/apt/sources.list; \
        fi; \
    fi

# 源码整体进镜像。.dockerignore 已排除 node_modules / .git / 本地构建产物，
# 这里拷进来的都是参与编译或运行时需要的文件。
COPY . .

# yarn 版本由根目录 package.json 的 packageManager 字段决定，corepack install 会装对应版本，
# 避免 CI 与本地 yarn 版本不一致（参见 .github/workflows/build.yml 的同类处理）。
# build/prepare.js 负责生成各 workspace 的 tsconfig 和 node_modules 软链接，是编译前置步骤。
RUN --mount=type=cache,target=/root/.yarn/berry/cache \
    --mount=type=cache,target=/root/.cache/node/corepack \
    --mount=type=cache,target=/root/.npm \
    if [ -n "$NPM_REGISTRY" ]; then \
        export COREPACK_NPM_REGISTRY="$NPM_REGISTRY"; \
        export YARN_NPM_REGISTRY_SERVER="$NPM_REGISTRY"; \
    fi; \
    corepack enable && \
    corepack install && \
    yarn --version && \
    yarn install && \
    node build/prepare.js

# 前端 production 构建：先生成图标字体（部分前端代码依赖它的类型），再用 webpack 打包。
# 产物在 packages/ui-default/public，运行时由 @hydrooj/ui-default 直接读取。
# webpack 的 filesystem cache 写在 .cache/，用 cache mount 挂出来：
# 既不进镜像，又能在依赖没变时跳过重复编译。
RUN --mount=type=cache,target=/root/.yarn/berry/cache \
    --mount=type=cache,target=/app/.cache \
    yarn build:ui:iconfont && \
    node --max-old-space-size=8192 packages/ui-default/build --production && \
    find packages/ui-default/public -maxdepth 1 -name '*.js' | wc -l && \
    test -f packages/ui-default/public/manifest.json

# ---------------------------------------------------------------- runtime
FROM ${NODE_IMAGE} AS runtime

ARG NPM_REGISTRY=

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

ENV NODE_ENV=production \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    PATH=/app/node_modules/.bin:$PATH

# curl 供 docker-compose 的 healthcheck（/status）使用
RUN --mount=type=cache,target=/root/.npm \
    apt-get -qq update && \
    apt-get install -y --no-install-recommends curl ca-certificates && \
    rm -rf /var/lib/apt/lists/* && \
    if [ -n "$NPM_REGISTRY" ]; then npm config set registry "$NPM_REGISTRY"; fi && \
    npm install -g pm2 && \
    npm cache clean --force

WORKDIR /app

# 整个工作区一起带走：workspace 之间有 node_modules 软链接，只拷 node_modules 会断链。
# 运行时代码由 @hydrooj/register 用 esbuild 直接从 TS 源码加载，不需要 tsc 产物。
COPY --from=builder /app /app

# 沿用 install/docker 的启动脚本（初始化 addon.json / config.json / 系统测评账号并启动 pm2）
COPY --from=builder /app/install/docker/backend/entrypoint.sh /root/entrypoint.sh
RUN chmod +x /root/entrypoint.sh

EXPOSE 8888

ENTRYPOINT ["/root/entrypoint.sh"]
