# 从源码构建后端镜像

`install/docker-hgnu/backend/Dockerfile` 是从 npm 安装发布版 `hydrooj` / `@hydrooj/ui-default`，
镜像里**不含**本仓库的定制代码。这里这份 Dockerfile 改用仓库源码，并把它编译出的前端静态资源一起打进镜像。

## 本地构建

构建上下文必须是仓库根目录（Dockerfile 里 `COPY` 整个工作区）：

```bash
docker build -f install/docker-hgnu/source/Dockerfile -t hgnuoj-backend:local .
```

国内网络可以换源：

```bash
docker build -f install/docker-hgnu/source/Dockerfile \
  --build-arg NPM_REGISTRY=https://registry.npmmirror.com \
  --build-arg APT_MIRROR=mirrors.tuna.tsinghua.edu.cn \
  -t hgnuoj-backend:local .
```

构建分两个阶段：

| 阶段 | 做什么 |
| --- | --- |
| `builder` | `yarn install` → `build/prepare.js` → 前端 iconfont + webpack production 构建 |
| `runtime` | 只装 `pm2`、`curl`，再把整个已编译的工作区拷进来 |

运行时代码由 `@hydrooj/register` 用 esbuild 直接从 TS 源码加载，所以不需要 `tsc` 产物；
前端静态资源在 `packages/ui-default/public`，由 `@hydrooj/ui-default` 直接读取。

## 构建产物检查

```bash
# 前端 webpack 产物（应有大量 .chunk.js 和 manifest.json）
docker run --rm --entrypoint sh hgnuoj-backend:local \
  -c 'ls packages/ui-default/public | head'

# 后端能从源码正常加载（bin 入口会初始化 global.Hydro）
docker run --rm --entrypoint sh hgnuoj-backend:local \
  -c 'node packages/hydrooj/bin/hydrooj.js addon list'
```

> 不要用 `node -e "require('hydrooj')"` 验证：`plugin-api` 里有些模块会写 `global.Hydro`，
> 只有经过 `bin/hydrooj.js` 才会初始化，直接 require 必报 `Cannot read properties of undefined`。

## 配合 docker-compose 使用

`install/docker-hgnu/docker-compose.yml` 默认拉 Docker Hub 上 CI 构建好的镜像，
本地构建时用环境变量指过去：

```yaml
  oj-backend:
    image: ${OJ_BACKEND_IMAGE:-ztl123z/hgnu-backend:latest}
```

```bash
docker build -f install/docker-hgnu/source/Dockerfile -t hgnuoj-backend:local .
cd install/docker-hgnu && OJ_BACKEND_IMAGE=hgnuoj-backend:local docker compose up -d
```

`oj-judge` 和 `oj-mongo` 同样默认拉 CI 镜像（`OJ_JUDGE_IMAGE` / `OJ_MONGO_IMAGE`），
不再需要本地构建，`docker compose up -d` 会三件套一起起。
测评机镜像自己的构建方式见 `../DEPLOY.md` 第 3.2 节。

## GitHub Actions

`.github/workflows/image.yml` 负责三个镜像（backend / judge / mongodb）：

- **push 到 `master`**：只构建 backend 并冒烟检查，不推送；judge/mongodb 不参与
- **手动 `Run workflow`**：用 `target` 选择 `backend`（默认）/ `judge` / `mongodb` / `all`
- **推送条件**：手动运行 + 分支 `master` + `publish=true`，三者同时满足才推

发布时三个镜像共用同一个时间戳 tag `YYYYMMDD-HHMMSS`（UTC），同时更新 `latest`。
发布信息会写进 Actions 的 run 摘要。

推送需要仓库 Actions secret `DOCKER_TOKEN`（Docker Hub Access Token，对
`ztl123z/hgnu-backend`、`ztl123z/hgnu-judge`、`ztl123z/hgnu-mongodb` 有 push 权限），
登录用户名是 `ztl123z`。fork 不会推送。
