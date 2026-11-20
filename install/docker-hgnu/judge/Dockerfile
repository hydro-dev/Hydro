# syntax=docker/dockerfile:1.7
#
# 测评机镜像：编译器链 + go-judge sandbox + hydrojudge。
#
# 首次构建很慢（编译器链有 ~1GB 下载量），国内网络建议换源：
#   docker build -f install/docker-hgnu/judge/Dockerfile \
#     --build-arg APT_MIRROR=mirrors.tuna.tsinghua.edu.cn \
#     --build-arg NPM_REGISTRY=https://registry.npmmirror.com \
#     -t hgnuoj-judge:local install/docker-hgnu/judge
#
# 默认只装 C/C++/Python/Java（COMPILERS=minimal）；需要 ghc/golang/rustc 等
# 再加 --build-arg COMPILERS=full（下载量约 1GB）。
#
# sandbox 二进制（go-judge）的获取顺序：
#   1. 构建上下文里的 ./sandbox 文件（离线内网可用）
#   2. GO_JUDGE_URLS 里的地址依次重试（默认官方 GitHub + 几个加速前缀）
# 构建机不通 GitHub 时，先手动下载放到 install/docker-hgnu/judge/sandbox 即可。

FROM node:22

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

ARG APT_MIRROR=
ARG NPM_REGISTRY=
# go-judge sandbox 二进制。按顺序尝试，第一个成功即止。
# 默认给官方地址 + 几个常用 GitHub 加速前缀；都失败时需要自己指定可访问的地址，
# 或者用 HTTP_PROXY/HTTPS_PROXY build-arg 让容器走代理。
ARG GO_JUDGE_URLS="https://github.com/criyle/go-judge/releases/download/v1.14.0/go-judge_1.14.0_linux_amd64v3 https://gh-proxy.com/https://github.com/criyle/go-judge/releases/download/v1.14.0/go-judge_1.14.0_linux_amd64v3 https://ghproxy.net/https://github.com/criyle/go-judge/releases/download/v1.14.0/go-judge_1.14.0_linux_amd64v3 https://ghfast.top/https://github.com/criyle/go-judge/releases/download/v1.14.0/go-judge_1.14.0_linux_amd64v3"
# minimal = gcc/g++/python3/openjdk；full = 原来的全套
# CI 默认构建 minimal（快、体积小）；需要更多语言时手动传 --build-arg COMPILERS=full
ARG COMPILERS=minimal

COPY ./entrypoint.sh /root/entrypoint.sh

# apt 的包缓存挂成 cache mount：构建中断后重试不用重新下载几百 MB
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    if [ -n "$APT_MIRROR" ]; then \
        if [ -f /etc/apt/sources.list.d/debian.sources ]; then \
            sed -i "s|deb.debian.org|${APT_MIRROR}|g; s|security.debian.org|${APT_MIRROR}/debian-security|g" /etc/apt/sources.list.d/debian.sources; \
        else \
            sed -i "s|deb.debian.org|${APT_MIRROR}|g" /etc/apt/sources.list; \
        fi; \
    fi && \
    apt-get -qq update && \
    if [ "$COMPILERS" = "minimal" ]; then \
        apt-get install -y gcc g++ python3 openjdk-17-jdk-headless; \
    else \
        apt-get install -y \
            gcc python3 g++ fp-compiler openjdk-17-jdk-headless \
            php-cli rustc ghc libjavascriptcoregtk-4.0-bin golang \
            ruby mono-runtime mono-mcs; \
    fi && \
    chmod +x /root/entrypoint.sh && \
    # node is at /usr/local/bin but hydrojudge will find it at /usr/bin
    ln -sf /usr/local/bin/node /usr/bin/node

# npm 缓存同样挂 cache mount，重试时不用重新下载
RUN --mount=type=cache,target=/root/.npm \
    if [ -n "$NPM_REGISTRY" ]; then npm config set registry "$NPM_REGISTRY"; fi && \
    npm install -g pm2 @hydrooj/hydrojudge && \
    npm cache clean --force

# go-judge 的 sandbox 二进制单独一层：下载失败时不用重跑 npm 安装。
# 优先用构建上下文里的本地文件 sandbox（离线/内网环境），否则按 GO_JUDGE_URLS 顺序重试。
RUN --mount=type=bind,source=.,target=/ctx \
    set -e; \
    if [ -s /ctx/sandbox ]; then \
        echo "==> 使用本地文件 /ctx/sandbox"; \
        cp /ctx/sandbox /usr/bin/sandbox; \
    else \
        for url in $GO_JUDGE_URLS; do \
            echo "==> trying $url"; \
            if wget --tries=2 --timeout=60 --waitretry=3 -q "$url" -O /usr/bin/sandbox && [ -s /usr/bin/sandbox ]; then \
                echo "==> downloaded from $url"; \
                break; \
            fi; \
            rm -f /usr/bin/sandbox; \
            echo "==> failed: $url"; \
        done; \
    fi; \
    if [ ! -s /usr/bin/sandbox ]; then \
        echo ""; \
        echo "ERROR: go-judge sandbox 下载失败。可选做法："; \
        echo "  1) 让构建走代理：--build-arg HTTP_PROXY=http://host:port --build-arg HTTPS_PROXY=http://host:port"; \
        echo "  2) 指定可用地址：--build-arg GO_JUDGE_URLS=<可访问的url>"; \
        echo "  3) 把二进制放到 install/docker-hgnu/judge/sandbox 后重新构建（离线可用）"; \
        exit 1; \
    fi; \
    chmod +x /usr/bin/sandbox

ENTRYPOINT ["/root/entrypoint.sh"]
