FROM node:22

WORKDIR /opt/hydro

RUN apt-get -qq update && \
    apt-get install -y \
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
    mono-mcs \
    git && \
    # node is at /usr/local/bin but hydrojudge will find it at /usr/bin
    # so make a symlink to it
    ln -s /usr/local/bin/node /usr/bin/node

# Official go-judge v1.9.4 Linux assets. The container is Linux, not macOS.
# arm64: go-judge_1.9.4_linux_arm64
# amd64: go-judge_1.9.4_linux_amd64v3
ARG TARGETARCH
RUN set -eu; \
    case "$TARGETARCH" in \
      arm64) asset=go-judge_1.9.4_linux_arm64 ;; \
      amd64|"") asset=go-judge_1.9.4_linux_amd64v3 ;; \
      *) echo "No go-judge v1.9.4 Linux asset selected for TARGETARCH=$TARGETARCH." >&2; exit 1 ;; \
    esac; \
    wget "https://github.com/criyle/go-judge/releases/download/v1.9.4/${asset}" -O /usr/bin/sandbox && \
    chmod +x /usr/bin/sandbox

COPY . .

# hydrojudge loads vendor/testlib/testlib.h on startup. npm publishes that
# submodule; a checkout with an empty gitlink does not. Pin matches
# packages/hydrojudge/vendor/testlib at 2d20123984e9479b8a56ebe0d6a51e23ad7c35b3.
RUN if [ ! -f packages/hydrojudge/vendor/testlib/testlib.h ]; then \
      rm -rf packages/hydrojudge/vendor/testlib && \
      mkdir -p packages/hydrojudge/vendor/testlib && \
      git -C packages/hydrojudge/vendor/testlib init && \
      git -C packages/hydrojudge/vendor/testlib remote add origin https://github.com/MikeMirzayanov/testlib.git && \
      git -C packages/hydrojudge/vendor/testlib fetch --depth 1 origin 2d20123984e9479b8a56ebe0d6a51e23ad7c35b3 && \
      git -C packages/hydrojudge/vendor/testlib checkout --detach FETCH_HEAD && \
      rm -rf packages/hydrojudge/vendor/testlib/.git; \
    fi

ENV YARN_ENABLE_IMMUTABLE_INSTALLS=false \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    PATH="/opt/hydro/node_modules/.bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

RUN corepack enable \
 && yarn set version 4.13.0 \
 && CI=true yarn install \
 && CI=true yarn build \
 && npm install -g pm2 \
 && chmod +x packages/hydrooj/bin/hydrooj.js packages/hydrojudge/bin/hydrojudge.js \
 && ln -sf /opt/hydro/packages/hydrojudge/bin/hydrojudge.js /usr/local/bin/hydrojudge \
 && cp install/docker/judge/entrypoint.sh /root/entrypoint.sh \
 && chmod +x /root/entrypoint.sh

ENTRYPOINT ["/root/entrypoint.sh"]
