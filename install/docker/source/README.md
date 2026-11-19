# 从源码构建后端镜像

`install/docker/backend/Dockerfile` 是从 npm 安装发布版 `hydrooj` / `@hydrooj/ui-default`，
镜像里**不含**本仓库的定制代码。这里这份 Dockerfile 改用仓库源码，并把它编译出的前端静态资源一起打进镜像。

## 本地构建

构建上下文必须是仓库根目录（Dockerfile 里 `COPY` 整个工作区）：

```bash
docker build -f install/docker/source/Dockerfile -t hgnuoj-backend:local .
```

国内网络可以换源：

```bash
docker build -f install/docker/source/Dockerfile \
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

`install/docker/docker-compose.yml` 的 `oj-backend` 已经改成引用这个镜像：

```yaml
  oj-backend:
    image: ${OJ_BACKEND_IMAGE:-hgnuoj-backend:local}
```

所以先在仓库根目录构建，再启动：

```bash
docker build -f install/docker/source/Dockerfile -t hgnuoj-backend:local .
cd install/docker && docker compose up -d
```

`oj-judge` 带有 `profiles: ["judge"]`，默认**不会**被 `up -d` 构建/启动（它的编译器链首次构建要半小时以上）。
需要测评机时先构建镜像，再带 profile 启动：

```bash
cd install/docker
docker build -f judge/Dockerfile \
  --build-arg APT_MIRROR=mirrors.tuna.tsinghua.edu.cn \
  --build-arg NPM_REGISTRY=https://registry.npmmirror.com \
  -t hgnuoj-judge:local judge

docker compose --profile judge up -d
```

想让它长期默认启动，在 `install/docker/.env` 里写 `COMPOSE_PROFILES=judge`。

### judge 构建的两个坑

1. **`COMPILERS=full` 会下载 ~1GB 编译器链**（ghc 一个就 70MB+）。只需要 C/C++/Python/Java 时加
   `--build-arg COMPILERS=minimal`，构建时间从半小时级降到十几秒。
2. **go-judge 的 `sandbox` 二进制在 GitHub Releases 上**，构建容器不继承宿主机的代理设置，国内常常拉不下来。
   最稳的做法是提前下载好放到 `install/docker/judge/sandbox`（该文件已 gitignore），Dockerfile 会优先用它：

   ```bash
   curl -L -o install/docker/judge/sandbox \
     https://github.com/criyle/go-judge/releases/download/v1.14.0/go-judge_1.14.0_linux_amd64v3
   chmod +x install/docker/judge/sandbox
   ```

   没有本地文件时，Dockerfile 会依次尝试 `GO_JUDGE_URLS` 里的多个地址（官方 + 几个加速前缀）；
   也可以 `--build-arg GO_JUDGE_URLS=<你的可用地址>` 指定。注意 sandbox 只有 **amd64** 版本。

## GitHub Actions

`.github/workflows/image.yml` 在每次 push 到 `master`（即分支合并进来）时：

1. 用这份 Dockerfile 完整构建一次镜像（含前端编译）
2. 冒烟检查镜像里的前端产物和后端模块能否加载
3. 构建层和 yarn 缓存存进 Actions 缓存，后续运行可复用

**push 触发只构建和冒烟检查，不推送镜像。** 需要发版时到 Actions 页面手动
`Run workflow`，分支选 `master`、把 `publish` 设为 `true`；构建和冒烟检查通过后才会把
同一个镜像推到公开仓库 `ztl123z/hgnu-backend`，打 `latest` 和构建时间戳
`YYYYMMDD-HHMMSS`（UTC）两个 tag。
默认 `publish=false`；手动运行选其他分支（包括 `ops-test`）时同样只构建、不推送，
不会覆盖 `latest`。

推送需要仓库 Actions secret `DOCKER_TOKEN`（Docker Hub Access Token，有
`ztl123z/hgnu-backend` 的 push 权限），登录用户名是 `ztl123z`。fork 不会推送。
