FROM node:22

# 设置 apt 为阿里云源
RUN sed -i 's@deb.debian.org@mirrors.aliyun.com@g' /etc/apt/sources.list.d/debian.sources 2>/dev/null || \
    sed -i 's@deb.debian.org@mirrors.aliyun.com@g' /etc/apt/sources.list

COPY ./entrypoint.sh /root/entrypoint.sh

RUN apt-get -qq update -o Acquire::AllowInsecureRepositories=true -o Acquire::AllowDowngradeToInsecureRepositories=true && \
    apt-get install -y --allow-unauthenticated --no-install-recommends \
    gcc \
    python3 \
    g++ \
    fp-compiler \
    openjdk-17-jdk-headless \
    php-cli \
    rustc \
    ghc \
    libjavascriptcoregtk-4.0-bin \
    golang \
    ruby \
    mono-runtime \
    mono-mcs && \
    chmod +x /root/entrypoint.sh && \
    ln -sf /usr/local/bin/node /usr/bin/node && \
    rm -rf /var/lib/apt/lists/*

RUN npm config set registry https://registry.npmmirror.com && \
    npm install -g --timeout=300000 pm2 @hydrooj/hydrojudge && \
    wget --timeout=60 https://ghproxy.net/https://github.com/criyle/go-judge/releases/download/v1.14.0/go-judge_1.14.0_linux_amd64v3 -O /usr/bin/sandbox && \
    chmod +x /usr/bin/sandbox

ENTRYPOINT ["/root/entrypoint.sh"]

