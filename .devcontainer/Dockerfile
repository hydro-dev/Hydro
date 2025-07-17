FROM mcr.microsoft.com/vscode/devcontainers/typescript-node:22-bookworm

RUN mkdir -p /root/.hydro /data/file && \
    chown -R root:root /root /root/.hydro /data/file && \
    echo '{"uri":"mongodb://mongo/hydro"}' > /root/.hydro/config.json && \
    echo '["@hydrooj/ui-default","@hydrooj/hydrojudge"]' > /root/.hydro/addon.json
