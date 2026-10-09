FROM node:22

WORKDIR /opt/hydro

# Build context is the repository root (see docker-compose.yml).
COPY . .

ENV YARN_ENABLE_IMMUTABLE_INSTALLS=false \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    PATH="/opt/hydro/node_modules/.bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

# Same Yarn as CI. The running process is this workspace after yarn build
# and yarn build:ui:production, not the npm tarballs of hydrooj / ui-default.
RUN corepack enable \
 && yarn set version 4.13.0 \
 && CI=true yarn install \
 && CI=true yarn build \
 && CI=true yarn build:ui:production \
 && npm install -g pm2 \
 && chmod +x packages/hydrooj/bin/hydrooj.js packages/hydrojudge/bin/hydrojudge.js \
 && ln -sf /opt/hydro/packages/hydrooj/bin/hydrooj.js /usr/local/bin/hydrooj \
 && cp install/docker/backend/entrypoint.sh /root/entrypoint.sh \
 && chmod +x /root/entrypoint.sh

ENTRYPOINT ["/root/entrypoint.sh"]
