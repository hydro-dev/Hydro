FROM node:20

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
    wget https://github.com/criyle/go-judge/releases/download/v1.8.0/go-judge_1.8.0_linux_amd64 -O /usr/bin/sandbox && \
    chmod +x /usr/bin/sandbox

ENTRYPOINT /root/entrypoint.sh
