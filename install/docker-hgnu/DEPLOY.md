# HGNUOJ Docker 部署

本目录（`install/docker-hgnu`）是 HGNUOJ 自己的编排方案，和上游 Hydro 的
`install/docker` **完全分开**：上游目录保持原样，方便跟随上游更新、减少合并冲突；
所有 HGNU 的定制（三个镜像的 Dockerfile、编排、发布流程、部署文档）都放在这里。

本文档对应 **预构建镜像** 方式：三个镜像都由 GitHub Actions 构建并发布到 Docker Hub，
部署时直接拉取，不需要在本地编译。想自己从源码构建见第三节。

> 本目录下的 `backend/Dockerfile` 是从 npm 安装官方包的旧方式，保留作参考，
> `docker-compose.yml` 已不再使用它。只想尽快起服务请看 [README.md](README.md)。

---

## 零、与官方 install/docker 的关系

| 目录 | 内容 |
| --- | --- |
| `install/docker/` | 上游 Hydro 原版，**不要在这里改**，`git pull` 会直接跟随上游 |
| `install/docker-hgnu/` | HGNU 定制版：预构建镜像编排、源码构建 Dockerfile、部署文档 |

三个镜像及来源：

| 服务 | 镜像 | 内容 |
| --- | --- | --- |
| `oj-mongo` | `ztl123z/hgnu-mongodb` | 官方 `mongo:7-jammy` 薄封装 + 首次初始化脚本 |
| `oj-backend` | `ztl123z/hgnu-backend` | 本仓库源码 + 编译好的前端产物 |
| `oj-judge` | `ztl123z/hgnu-judge` | go-judge sandbox + 编译器链（默认 gcc/g++/python3/openjdk） |

两个 compose 用相同的容器名（`oj-backend` / `oj-mongo` / `oj-judge`），
**同一时间只能启动其中一套**。从官方目录切过来之前先停掉旧容器：

```bash
cd install/docker && docker compose down
cd ../docker-hgnu && docker compose up -d
```

数据目录也不共享：本目录使用 `install/docker-hgnu/data`。如果需要沿用官方目录下已有的
数据，在启动前把 `install/docker/data` 复制过来：

```bash
cp -a install/docker/data install/docker-hgnu/data
```

---

## 一、前置条件

- Linux（本方案在 WSL2 / Debian 上验证过）
- Docker Engine 24+，含 compose v2（`docker compose version` 能输出版本）
- 磁盘：三个镜像约 2.2GB + 1.2GB + 3.4GB，另需给 `data/` 留空间
- 宿主机 80 端口空闲；`oj-judge` 需要 `privileged: true`
- 网络：能访问 Docker Hub（或提前 `docker save` / `docker load` 离线传输）

确认环境：

```bash
docker version
docker compose version
```

要自己构建镜像时才需要 Buildx（`docker buildx version`）；缺 buildx 时构建会报
`BuildKit is enabled but the buildx component is missing or broken`。
Debian/Ubuntu 可 `apt install docker-buildx-plugin`，或从
<https://github.com/docker/buildx/releases> 下载二进制放到 `~/.docker/cli-plugins/docker-buildx`。

---

## 二、获取代码

```bash
git clone https://github.com/ZTL123Z/HGNUOJ.git
cd HGNUOJ
```

---

## 三、（可选）自己构建镜像

平时部署**不需要**这一节，直接拉 CI 发布的镜像即可。以下命令用于本地调试、
改 Dockerfile 后验证，或离线环境自建。

### 3.1 后端镜像

**必须在仓库根目录执行**（构建上下文是整个工作区，Dockerfile 里要 `COPY` `packages/`、`framework/`）。

```bash
docker build -f install/docker-hgnu/source/Dockerfile -t hgnuoj-backend:local .
```

国内网络建议换源：

```bash
docker build -f install/docker-hgnu/source/Dockerfile \
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

### 3.2 测评机镜像

构建上下文是本目录下的 `judge/`。默认只装 gcc/g++/python3/openjdk
（`COMPILERS=minimal`，镜像约 2.2GB）；需要 rust/ghc/golang/php/ruby/mono 时传 `full`。

```bash
docker build -f install/docker-hgnu/judge/Dockerfile \
  --build-arg COMPILERS=minimal \
  -t hgnuoj-judge:local install/docker-hgnu/judge
```

sandbox 二进制不在仓库里，Dockerfile 会按 `GO_JUDGE_URLS` 依次尝试下载；
构建机不通 GitHub 时，先把二进制放到 `install/docker-hgnu/judge/sandbox`（已 gitignore），
或用 `--build-arg GO_JUDGE_URLS=<可访问地址>` 指定。sandbox **只有 amd64 版本**。

### 3.3 MongoDB 镜像

```bash
docker build -t hgnuoj-mongodb:local install/docker-hgnu/mongodb
```

在官方 `mongo:7-jammy` 上加了 `mongodb/initdb/` 里的首次初始化脚本，
不开启认证，行为与官方一致。

---

## 四、启动服务

### 方式 A：使用 CI 发布的镜像（推荐）

三个镜像都通过 GitHub Actions 发布到 Docker Hub，`docker compose` 默认就引用它们：

```bash
cd install/docker-hgnu
docker compose pull
docker compose up -d
docker compose ps                 # 三个都应是 healthy
curl -I http://localhost/status   # 期望 200
```

这是 **public** 仓库，拉取不需要登录。

每次发布的镜像同时打两个 tag：

- `latest`：最近一次手动发布的构建
- `YYYYMMDD-HHMMSS`：构建时间（UTC），固定版本，适合回滚 / 核对代码版本。
  例如 `20261119-063000`。**同一批发布的三个镜像共用同一个时间戳。**

生产环境建议固定版本，写进 `install/docker-hgnu/.env`（已被 `.gitignore` 排除）：

```dotenv
OJ_BACKEND_IMAGE=ztl123z/hgnu-backend:20261119-063000
OJ_JUDGE_IMAGE=ztl123z/hgnu-judge:20261119-063000
OJ_MONGO_IMAGE=ztl123z/hgnu-mongodb:20261119-063000
```

三个变量都可以单独覆盖；只想换某一个时，只写那一个即可。

### 方式 B：使用本地构建镜像

先按第三节构建出 `hgnuoj-backend:local` 等镜像，再用环境变量指过去：

```bash
cd install/docker-hgnu
OJ_BACKEND_IMAGE=hgnuoj-backend:local \
OJ_JUDGE_IMAGE=hgnuoj-judge:local \
OJ_MONGO_IMAGE=hgnuoj-mongodb:local \
docker compose up -d
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

**部署到公网前务必修改 judge 密码**，并同步改 `install/docker-hgnu/judge/judge.yaml` 里的 `password`。

---

## 六、测评机

CI 发布的 `ztl123z/hgnu-judge` 默认带 gcc/g++/python3/openjdk，`docker compose up -d`
会随另外两个服务一起启动，**不再需要本地构建，也不在 profile 里**。

- 配置文件：`judge/judge.yaml`（后端地址、账号）和 `judge/mount.yaml`（沙箱挂载规则）
- 默认账号：`judge` / `examplepassword`，对应后端 entrypoint 创建的 uid 2
- 需要 rust/ghc/golang/php/ruby/mono：按 3.2 节用 `--build-arg COMPILERS=full`
  自己构建，再用 `OJ_JUDGE_IMAGE` 指过去；或改 `image.yml` 里 judge 作业的
  `build-args` 后手动发布一版
- `judge/sandbox` 不入库（体积大），CI 构建时由 Dockerfile 从 `GO_JUDGE_URLS` 下载

只想跑前后端时可以单独启动：

```bash
cd install/docker-hgnu
docker compose up -d oj-mongo oj-backend
```

---

## 七、更新代码

使用 Docker Hub 镜像时，先确认有人在 Actions 里手动发布过（`publish=true`），然后在
`install/docker-hgnu` 下拉新镜像并重建对应容器（mongo 和数据不动）：

```bash
export OJ_BACKEND_IMAGE=ztl123z/hgnu-backend:latest
docker compose pull oj-backend
docker compose up -d oj-backend
```

三个一起更新（固定版本时先改 `.env` 里的三个变量）：

```bash
docker compose pull
docker compose up -d
```

使用本地构建镜像时：

```bash
git pull

# 在仓库根目录重新构建
docker build -f install/docker-hgnu/source/Dockerfile -t hgnuoj-backend:local .

cd install/docker-hgnu
docker compose up -d oj-backend    # 只重建 backend，mongo 和数据不动
```

数据在 `install/docker-hgnu/data/`（`mongo/` 数据库、`file/` 附件、`backend/` 运行时配置），
重建容器不会影响它们。更新前建议按第八节备份。

---

## 八、常用运维命令

```bash
cd install/docker-hgnu

docker compose ps                          # 状态
docker compose logs -f oj-backend          # 日志
docker compose logs -f oj-judge            # 测评机日志
docker compose restart oj-backend          # 重启
docker compose down                        # 停止并删除容器（数据保留）
docker compose up -d                       # 启动全部（含 judge）

# 进容器执行 CLI
docker exec -it oj-backend hydrooj cli user setSuperAdmin 4
docker exec -it oj-backend sh
```

### 备份

`hydrooj cli backup` 依赖 `mongodump` 和 `zip`，**这两个后端镜像里都没有**，
在宿主机上直接用 mongodump 更简单：

```bash
cd install/docker-hgnu

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

### `docker compose up -d` 卡在拉取 judge 镜像

judge 镜像约 2.2GB，国内拉取可能较慢，属于网络问题，不是构建卡住。
离线部署见 README.md 的「想完全离线部署」。

### 构建报 `buildx component is missing`

只有自己构建镜像时才需要 buildx，见「一、前置条件」。

### judge 构建卡在下载 sandbox / ghc

- sandbox：先把二进制放到 `judge/sandbox`（见 3.2 节）
- ghc 等编译器：加 `--build-arg APT_MIRROR=mirrors.tuna.tsinghua.edu.cn`

### 端口 80 被占用

改 `install/docker-hgnu/docker-compose.yml` 里 `oj-backend` 的 `ports`，
只改冒号左边（宿主机端口），右边保持 `8888`。

---

## 十、文件说明

| 文件 | 说明 |
| --- | --- |
| `install/docker-hgnu/README.md` | 一键启动三个镜像的简明流程 |
| `install/docker-hgnu/docker-compose.yml` | 编排文件，默认引用三个 Docker Hub 镜像 |
| `install/docker-hgnu/source/Dockerfile` | 后端镜像（多阶段，源码 + 前端产物） |
| `install/docker-hgnu/source/README.md` | 后端构建细节与产物检查方法 |
| `install/docker-hgnu/judge/Dockerfile` | 测评机镜像，支持换源与本地 sandbox |
| `install/docker-hgnu/judge/judge.yaml` | 测评机连接后端的配置 |
| `install/docker-hgnu/judge/mount.yaml` | 沙箱挂载规则 |
| `install/docker-hgnu/mongodb/Dockerfile` | MongoDB 薄封装镜像 |
| `install/docker-hgnu/mongodb/initdb/` | 首次启动执行的初始化脚本 |
| `install/docker-hgnu/backend/Dockerfile` | 旧的 npm 安装方式，compose 已不再使用 |
| `.dockerignore` | 构建上下文排除规则 |
| `.github/workflows/image.yml` | 三个镜像的构建与手动发布 |
| `.github/workflows/scripts/push-image.sh` | 打 tag + 推送的公共脚本 |

镜像 tag 可用环境变量覆盖（也可以写进 `.env`）：

```bash
OJ_BACKEND_IMAGE=ztl123z/hgnu-backend:latest docker compose up -d
OJ_BACKEND_IMAGE=ztl123z/hgnu-backend:20261119-063000 \
OJ_JUDGE_IMAGE=ztl123z/hgnu-judge:20261119-063000 \
OJ_MONGO_IMAGE=ztl123z/hgnu-mongodb:20261119-063000 \
docker compose up -d
```
