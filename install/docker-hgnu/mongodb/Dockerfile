# HGNUOJ 的 MongoDB 镜像
#
# 官方 mongo:7-jammy 的薄封装：不修改 entrypoint、不改认证方式，行为与官方一致，
# 只是多带一份首次启动的初始化脚本，并让国内/内网环境能从自己的 Docker Hub 仓库拉取。
#
# 构建（上下文是本目录）：
#   docker build -t hgnu-mongodb:local install/docker-hgnu/mongodb
#
# 注意：官方镜像默认**不开启认证**，初始化脚本也不开启。
# 如果以后要加 --auth，需要同时修改后端连接串，否则 oj-backend 会连不上。

FROM mongo:7-jammy

# 官方镜像启动时会按文件名顺序执行这里的 .js / .sh 脚本，且只在数据目录为空
# （也就是全新 volume）时执行一次。数据目录已有内容时会被跳过，不会重复执行。
COPY initdb/ /docker-entrypoint-initdb.d/

LABEL org.opencontainers.image.title="hgnu-mongodb" \
      org.opencontainers.image.description="MongoDB 7 for HGNUOJ (thin wrapper with init scripts)" \
      org.opencontainers.image.source="https://github.com/ZTL123Z/HGNUOJ"

# 与官方镜像保持一致
EXPOSE 27017
CMD ["mongod"]
