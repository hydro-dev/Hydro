# HGNUOJ Docker 部署

本文档对应 **源码构建** 方式：镜像里打包的是本仓库当前 commit 的代码 + 编译好的前端产物，
而不是从 npm 拉取的官方 `hydrooj` 包。

> `install/docker/backend/Dockerfile`（旧的 npm 方式）保留未删，但 compose 已不再使用它。

---

## 一、前置条件

- Linux（本方案在 WSL2 / Debian 上验证过）
- Docker Engine 24+，含 Buildx（`docker buildx version` 能输出版本）
- 磁盘：镜像约 **3.4GB**（压缩后约 700MB），另需给 mongo 留空间
- 网络：能访问 GitHub（拉取仓库）与 npm registry

确认环境：

```bash
docker version
docker buildx version
docker compose version
```

> Docker 版本过低（缺 buildx）时构建会直接报
> `BuildKit is enabled but the buildx component is missing or broken`。
> Debian/Ubuntu 可 `apt install docker-buildx-plugin`，或从
> <https://github.com/docker/buildx/releases> 下载二进制放到 `~/.docker/cli-plugins/docker-buildx`。

---

## 二、获取代码

```bash
git clone https://github.com/ZTL123Z/HGNUOJ.git
cd HGNUOJ
```

---

## 三、构建后端镜像

**必须在仓库根目录执行**（构建上下文是整个工作区，Dockerfile 里要 `COPY` `packages/`、`framework/`）。

```bash
docker build -f install/docker/source/Dockerfile -t hgnuoj-backend:local .
```

国内网络建议换源：

```bash
docker build -f install/docker/source/Dockerfile \
  --build-arg NPM_REGISTRY=https://registry.npmmirror.com \
  --build-arg APT_MIRROR=mirrors.tuna.tsinghua.edu.cn \
  -t hgnuoj-backend:local .
```

构建耗时参考（实测）：

| 阶段 | 冷构建 | 有缓存 |
| --- | --- | --- |
| `yarn install` + prepare | ~540s | ~53s |
| iconfont + webpack production | ~48s | ~44s |
| runtime 阶段 | ~20s | — |

构建做了什么：

1. `corepack install`：按根目录 `package.json` 的 `packageManager` 固定 yarn 版本
2. `yarn install` + `node build/prepare.js`：装依赖、生成各 workspace 的 tsconfig 与软链接
3. `yarn build:ui:iconfont` + webpack production：编译前端到 `packages/ui-default/public`
4. 最终阶段只装 `pm2`、`curl`，把整个已编译工作区拷进去

---

## 四、启动服务

### 方式 A：使用 CI 推送到 Docker Hub 的镜像（推荐）

`master` 有新提交、且构建和冒烟检查通过后，GitHub Actions 会把镜像推到
`ztl123z/hgnu-backend`，同时打两个 tag：

- `latest`：当前 `master` 最新构建
- `sha-<7 位 commit>`：固定版本，适合回滚 / 核对代码版本

这是 **public** 仓库，拉取不需要登录。也可以到 Actions 页面手动
`Run workflow` 并把 `publish` 设为 `true`；默认 `publish=false` 只试构建，不覆盖 `latest`。

```bash
cd install/docker
OJ_BACKEND_IMAGE=ztl123z/hgnu-backend:latest docker compose pull oj-backend
OJ_BACKEND_IMAGE=ztl123z/hgnu-backend:latest docker compose up -d
```

固定版本时把 `:latest` 换成 `:sha-abcdefg`。`pull` 和 `up` 要用同一个
`OJ_BACKEND_IMAGE`，否则 compose 会去拉默认的 `hgnuoj-backend:local`；
想长期固定，可写入 `install/docker/.env`（该文件已被 `.gitignore` 排除）：

```bash
OJ_BACKEND_IMAGE=ztl123z/hgnu-backend:latest
```

CI 推送需要仓库 Actions secret `DOCKER_TOKEN`（Docker Hub Access Token，对
`ztl123z/hgnu-backend` 有 push 权限）。不要把 token 写进 compose、`.env` 或代码仓库。

### 方式 B：使用本地构建镜像

先按第三节构建出 `hgnuoj-backend:local`，再：

```bash
cd install/docker
docker compose up -d
```

默认只启动 **mongo + backend**，`oj-judge` 在 `judge` profile 里，不会自动构建。

```bash
docker compose ps                 # 两个容器都应是 healthy
curl -I http://localhost/status   # 期望 200
```

首次启动约 30 秒，entrypoint 会自动：

- 生成 `data/backend/config.json`（连接 `oj-mongo`）
- 生成 `data/backend/addon.json`（启用 `@hydrooj/ui-default`）
- 创建测评账号 `judge`（uid 2）
- 通过 pm2 拉起 `hydrooj`

查看日志：

```bash
docker logs -f oj-backend
```

端口在 `docker-compose.yml` 的 `ports: "80:8888"`，80 被占用就改这里
（容器内固定监听 8888，改容器内端口无效）。

---

## 五、初始账号

启动后**没有任何可登录的管理员账号**，需要自己创建：

```bash
# 1. 创建用户（uid 需要显式给，且不能与已有 uid 冲突）
docker exec oj-backend hydrooj cli user create you@example.com yourname 'YourPassword' 4

# 2. 提权为超级管理员（priv = -1）
docker exec oj-backend hydrooj cli user setSuperAdmin 4
```

> `cli user create` 的参数顺序是 `mail uname password uid [regip] [priv]`，
> uid 是**必填**的（不填会报 `Too few arguments. Min 4`）。

已有账号：

| 账号 | 密码 | uid | 用途 |
| --- | --- | --- | --- |
| `judge` | `examplepassword` | 2 | 测评机（见 `judge/judge.yaml`） |

**部署到公网前务必修改 judge 密码**，并同步改 `install/docker/judge/judge.yaml` 里的 `password`。

---

## 六、测评机（可选）

judge 镜像要装一整套编译器（gcc/g++/openjdk/rustc/ghc/golang/php/ruby/mono），
下载量约 1GB，**首次构建可能 30 分钟以上**，所以默认不启动。

```bash
cd install/docker

# 1. 准备 sandbox 二进制（构建容器不继承宿主机代理，GitHub 常常拉不下来）
curl -L -o judge/sandbox \
  https://github.com/criyle/go-judge/releases/download/v1.14.0/go-judge_1.14.0_linux_amd64v3
chmod +x judge/sandbox

# 2. 构建 judge 镜像
docker build -f judge/Dockerfile \
  --build-arg APT_MIRROR=mirrors.tuna.tsinghua.edu.cn \
  --build-arg NPM_REGISTRY=https://registry.npmmirror.com \
  --build-arg COMPILERS=minimal \
  -t hgnuoj-judge:local judge

# 3. 带 profile 启动
docker compose --profile judge up -d
```

- `COMPILERS=minimal` 只装 gcc/g++/python3/openjdk，**实测 11 秒**建成。
  需要 rust/ghc/golang/php/ruby/mono 就去掉这个参数（默认 `full`）。
- `judge/sandbox` 已在 `.gitignore` 里，不会入库。
- 没有本地 sandbox 文件时，Dockerfile 会依次尝试 `GO_JUDGE_URLS` 里的多个地址；
  也可用 `--build-arg GO_JUDGE_URLS=<你的地址>` 指定。
- sandbox 二进制**只有 amd64 版本**，arm64 机器需要自行处理。

想每次 `up -d` 都带上 judge，在 `install/docker/.env` 写：

```
COMPOSE_PROFILES=judge
```

---

## 七、更新代码

使用 Docker Hub 镜像时，先确认 CI 构建成功，然后在 `install/docker` 下拉新镜像并重建
backend 容器（mongo 和数据不动）：

```bash
export OJ_BACKEND_IMAGE=ztl123z/hgnu-backend:latest
docker compose pull oj-backend
docker compose up -d oj-backend
```

使用本地构建镜像时：

```bash
git pull

# 在仓库根目录重新构建
docker build -f install/docker/source/Dockerfile -t hgnuoj-backend:local .

cd install/docker
docker compose up -d oj-backend    # 只重建 backend，mongo 和数据不动
```

数据在 `install/docker/data/`（`mongo/` 数据库、`file/` 附件、`backend/` 运行时配置），
重建容器不会影响它们。更新前建议按第八节备份。

---

## 八、常用运维命令

```bash
cd install/docker

docker compose ps                          # 状态
docker compose logs -f oj-backend          # 日志
docker compose restart oj-backend          # 重启
docker compose down                        # 停止并删除容器（数据保留）
docker compose --profile judge up -d       # 启动含 judge

# 进容器执行 CLI
docker exec -it oj-backend hydrooj cli user setSuperAdmin 4
docker exec -it oj-backend sh
```

### 备份

`hydrooj cli backup` 依赖 `mongodump` 和 `zip`，**这两个后端镜像里都没有**，
在宿主机上直接用 mongodump 更简单：

```bash
cd install/docker

# 数据库
docker exec oj-mongo mongodump \
  --db hydro --archive=/tmp/hydro-$(date +%F).gz --gzip
docker cp oj-mongo:/tmp/hydro-$(date +%F).gz ./hydro-$(date +%F).gz

# 上传的附件与运行时配置
tar czf hydro-data-$(date +%F).tar.gz data/file data/backend
```

恢复：

```bash
docker cp ./hydro-2026-11-18.gz oj-mongo:/tmp/restore.gz
docker exec oj-mongo mongorestore --archive=/tmp/restore.gz --gzip --drop
docker compose restart oj-backend
```

---

## 九、常见问题

### 页面看起来像「官方 Hydro」

代码层面 HGNU 的定制是生效的（页脚有 `Modified by HGNU ACM TEAM`，
模板里有 `courses_main.html`、`manage_student_import.html`、`hgnu_tool.html`）。

看起来像原版的原因通常是：

1. **数据库是全新的**。系统设置里 `server.name` 默认就是 `"Hydro"`，
   首页横幅是官方欢迎语。登录管理员后到
   `/manage/setting` 把 `server.name` 改成 `HGNUOJ`，并修改首页横幅。
2. **组队功能只在登录后可见**。`/contest` 页的「我的队伍」入口受
   `PRIV_USER_PROFILE` 保护，游客看不到；`/contest/team` 需要登录访问。
   另外团队参赛只对「允许团队参赛」的比赛生效，没有比赛时自然看不到。
3. **首页「实用工具」卡片默认不显示**。`hgnu_tool.html` 模板存在，
   但 `packages/hydrooj/setting.yaml` 的 `homepage.default` 里没有它。
   需要在 `/manage/setting` 的 Homepage config 里手动加：
   ```yaml
   - width: 3
     hitokoto: true
     starred_problems: 50
     recent_problems: 10
     discussion_nodes: true
     suggestion: true
     hgnu_tool: true
   ```

### `docker compose up -d` 卡在构建 judge

judge 已移到 `judge` profile，默认不会被构建。
如果仍然触发，检查是否在 `.env` 里设了 `COMPOSE_PROFILES=judge`。

### 构建报 `buildx component is missing`

见「一、前置条件」。

### judge 构建卡在下载 sandbox / ghc

- sandbox：先把二进制放到 `judge/sandbox`（见第六节）
- ghc 等编译器：加 `--build-arg APT_MIRROR=mirrors.tuna.tsinghua.edu.cn`

### 端口 80 被占用

改 `install/docker/docker-compose.yml` 里 `oj-backend` 的 `ports`，
只改冒号左边（宿主机端口），右边保持 `8888`。

---

## 十、文件说明

| 文件 | 说明 |
| --- | --- |
| `install/docker/source/Dockerfile` | 源码构建后端镜像（多阶段） |
| `install/docker/source/README.md` | 构建细节与产物检查方法 |
| `install/docker/docker-compose.yml` | 编排文件；backend 用 `hgnuoj-backend:local` |
| `install/docker/judge/Dockerfile` | 测评机镜像，支持换源与本地 sandbox |
| `install/docker/backend/Dockerfile` | 旧的 npm 安装方式，compose 已不再使用 |
| `.dockerignore` | 构建上下文排除规则 |
| `.github/workflows/image.yml` | push 到 master 时构建、冒烟检查，通过后推送 Docker Hub |

镜像 tag 可用环境变量覆盖：

```bash
OJ_BACKEND_IMAGE=ztl123z/hgnu-backend:latest docker compose up -d
OJ_BACKEND_IMAGE=ztl123z/hgnu-backend:sha-abc1234 docker compose up -d
```
