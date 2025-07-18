FROM mcr.microsoft.com/vscode/devcontainers/typescript-node:22-bookworm

RUN install -d -o root -g root /root/.hydro /data/file && \
    echo '{"uri":"mongodb://mongo/hydro"}' > /root/.hydro/config.json && \
    echo '["@hydrooj/ui-default","@hydrooj/hydrojudge"]' > /root/.hydro/addon.json
