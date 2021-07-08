FROM node:14

RUN apt-get -qq update && \
    apt-get install -y \
    gcc \
    python3 \
    g++ \
    fp-compiler \
    openjdk-8-jdk-headless \
    python \
    php7.0-cli \
    rustc \
    haskell-platform \
    libjavascriptcoregtk-4.0-bin \
    golang \
    ruby \
    mono-runtime \
    mono-mcs

ADD ./entrypoint.sh /root/entrypoint.sh
ADD ./judge.yaml /root/judge.yaml
RUN chmod +x /root/entrypoint.sh

RUN yarn global add pm2 @hydrooj/hydrojudge && \
    wget https://s3.undefined.moe/file/executor-amd64 -O /usr/bin/sandbox && \
    chmod +x /usr/bin/sandbox

ENTRYPOINT /root/entrypoint.sh
