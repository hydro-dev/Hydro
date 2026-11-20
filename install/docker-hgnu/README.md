# 一键启动 HGNUOJ

本目录是 HGNU 的定制编排，和上游 Hydro 的 `install/docker` 完全分开。
三个服务都用 GitHub Actions 构建好、推到 Docker Hub 的镜像，**不需要在本地编译**：

| 服务 | 镜像 | 内容 |
| --- | --- | --- |
| `oj-mongo` | `ztl123z/hgnu-mongodb` | 官方 `mongo:7-jammy` 薄封装 + 首次初始化脚本 |
| `oj-backend` | `ztl123z/hgnu-backend` | 本仓库源码 + 编译好的前端产物 |
| `oj-judge` | `ztl123z/hgnu-judge` | go-judge sandbox + 编译器链（默认 gcc/g++/python3/openjdk） |

镜像都是 public，拉取不需要登录。

---

## 一、最短路径：三条命令起服务

```bash
cd install/docker-hgnu
docker compose pull          # 拉三个镜像
docker compose up -d         # 启动 mongo → backend → judge（按依赖顺序）
docker compose ps            # 三个都应是 healthy
```

打开 `http://<服务器 IP>/` 就能看到站点。首次启动约 30–60 秒，
backend 的 entrypoint 会自动生成配置、建测评账号、拉起 pm2。

只想跑前后端、不要测评机：

```bash
docker compose up -d oj-mongo oj-backend
```

---

## 二、前置条件

- Linux + Docker Engine 24+（含 compose v2，`docker compose version` 能输出版本）
- 宿主机 **80 端口空闲**（被占用就改 compose 里 `ports: "80:8888"` 的左边）
- 磁盘：三个镜像约 2.2GB + 1.2GB + 3.4GB，另需给 `data/` 留空间
- `oj-judge` 需要 `privileged: true`（沙箱要挂载内核能力），部分受限环境会被拒绝

---

## 三、固定版本 / 切换镜像

默认用 `latest`。生产环境建议固定到某次发布的时间戳 tag（同一批发布的三个镜像
共用同一个时间戳，可以整套对齐）：

```bash
docker pull ztl123z/hgnu-backend:20261119-063000
docker pull ztl123z/hgnu-judge:20261119-063000
docker pull ztl123z/hgnu-mongodb:20261119-063000
```

把固定版本写进本目录的 `.env`（已被 `.gitignore` 排除，不会入库）：

```dotenv
OJ_BACKEND_IMAGE=ztl123z/hgnu-backend:20261119-063000
OJ_JUDGE_IMAGE=ztl123z/hgnu-judge:20261119-063000
OJ_MONGO_IMAGE=ztl123z/hgnu-mongodb:20261119-063000
```

之后 `docker compose pull && docker compose up -d` 就会一直用这套版本。

可用变量：

| 变量 | 默认值 |
| --- | --- |
| `OJ_BACKEND_IMAGE` | `ztl123z/hgnu-backend:latest` |
| `OJ_JUDGE_IMAGE` | `ztl123z/hgnu-judge:latest` |
| `OJ_MONGO_IMAGE` | `ztl123z/hgnu-mongodb:latest` |

---

## 四、镜像什么时候更新

GitHub Actions 的 `Image` workflow 负责构建和发布，规则是**手动确认才发布**：

| 操作 | 结果 |
| --- | --- |
| push 到 `master` | 只构建 backend 并冒烟检查，**不推送**；judge/mongodb 不参与 |
| Actions 手动运行，`target=backend`（默认） | 只构建 backend |
| 手动运行，`target=judge` 或 `mongodb` | 只构建对应镜像（它们很少变，push 时不编译） |
| 手动运行，`target=all` | 三个都构建 |
| 以上任何一种 + `publish=true` + 分支 `master` | 构建通过后推送时间戳 tag 和 `latest` |

所以正常发布流程是：

1. 等 `master` 的 backend 构建通过（确认代码能编译）
2. Actions → `Image` → `Run workflow`
3. 分支选 `master`，`target` 选 `all`（或只选变了的那个），`publish` 选 `true`
4. 构建和冒烟检查通过后，三个镜像打上同一个时间戳 tag 推送到 Docker Hub

> 手动运行如果选了其他分支，或 `publish` 留 `false`，都只构建不推送。

---

## 五、日常运维

```bash
cd install/docker-hgnu

docker compose ps                      # 状态
docker compose logs -f oj-backend      # 后端日志
docker compose logs -f oj-judge        # 测评机日志
docker compose restart oj-backend      # 只重启后端
docker compose down                    # 停止并删除容器（数据保留在 data/）
docker compose up -d                   # 重新启动

# 更新镜像后只重建 backend
docker compose pull oj-backend
docker compose up -d oj-backend
```

数据都在本目录的 `data/` 下，重建容器不受影响：

| 路径 | 内容 |
| --- | --- |
| `data/mongo/` | MongoDB 数据库文件 |
| `data/file/` | 用户上传的附件 |
| `data/backend/` | 运行时配置（`config.json`、`addon.json` 等） |

### 建管理员账号

```bash
docker exec -it oj-backend hydrooj cli user create you@example.com yourname 'YourPassword' 4
docker exec -it oj-backend hydrooj cli user setSuperAdmin 4
```

### 备份

```bash
cd install/docker-hgnu
docker exec oj-mongo mongodump --db hydro --archive=/tmp/hydro.gz --gzip
docker cp oj-mongo:/tmp/hydro.gz ./hydro-$(date +%F).gz
tar czf hgnu-data-$(date +%F).tar.gz data/file data/backend
```

---

## 六、从官方 install/docker 迁移过来

两边容器名相同（`oj-backend` / `oj-mongo` / `oj-judge`），**同一时间只能跑一套**。

如果之前用官方目录起过服务，先把旧容器停掉，再把数据搬过来：

```bash
# 1. 停掉旧的一套
cd install/docker && docker compose down

# 2. 复制数据（mongo 数据 + 附件 + 运行时配置）
cp -a install/docker/data install/docker-hgnu/data

# 3. 用新目录启动
cd install/docker-hgnu && docker compose up -d
```

`judge` 的账号密码在 `judge/judge.yaml`（默认 `judge` / `examplepassword`，
对应后端 entrypoint 创建的 uid 2 测评账号）。**部署到公网前务必改掉**。

---

## 七、常见问题

### 拉不到镜像 / 拉取很慢

Docker Hub 国内访问不稳定时，可以给 daemon 配镜像加速，或在能联网的机器上
`docker pull` 后 `docker save` / `docker load` 带过去。镜像是 public，不需要登录。

### backend 一直不 healthy

```bash
docker compose logs oj-backend
```

常见原因：mongo 还没起来（compose 会等 healthcheck，一般不会）、
80 端口被占用（容器能起来但宿主机访问不到）、`data/backend/config.json`
里的 mongo 地址被改错。

### judge 起不来 / 一直重启

```bash
docker compose logs oj-judge
```

- 确认 `judge/judge.yaml` 里的 `server_url` 是 `http://oj-backend:8888/`（compose 内部域名）
- 密码要和后端 `judge` 账号一致
- 报权限错误时检查 Docker 是否允许 `privileged` 容器

### 需要更多编程语言

默认镜像只有 gcc/g++/python3/openjdk。需要 rust/ghc/golang/php/ruby/mono 时，
自己用 `--build-arg COMPILERS=full` 构建一份 judge 镜像，再用 `OJ_JUDGE_IMAGE` 指过去；
也可以改 `.github/workflows/image.yml` 里 judge 作业的 `build-args` 后手动发布。

### 想完全离线部署

在一台能联网的机器上：

```bash
docker pull ztl123z/hgnu-backend:20261119-063000
docker pull ztl123z/hgnu-judge:20261119-063000
docker pull ztl123z/hgnu-mongodb:20261119-063000
docker save -o hgnu-images.tar \
  ztl123z/hgnu-backend:20261119-063000 \
  ztl123z/hgnu-judge:20261119-063000 \
  ztl123z/hgnu-mongodb:20261119-063000
```

把 tar 拷到目标机器 `docker load -i hgnu-images.tar`，再把上面三个变量写进 `.env`。
