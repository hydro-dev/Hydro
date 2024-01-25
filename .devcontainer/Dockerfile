FROM mcr.microsoft.com/vscode/devcontainers/typescript-node:18-bullseye
ADD https://github.com/criyle/go-judge/releases/download/v1.6.3/executorserver_1.6.3_linux_amd64 /usr/bin/sandbox
RUN npm install -g yarn && \
    sudo apt-get update && sudo apt-get install gcc g++ && \
    mkdir -p /root/.hydro /data/file && chmod +x /usr/bin/sandbox && \
    chown -R root:root /root /root/.hydro /data/file && \
    echo '{"uri":"mongodb://mongo/hydro"}' > /root/.hydro/config.json && \
    echo '["@hydrooj/ui-default","@hydrooj/hydrojudge"]' > /root/.hydro/addon.json
ENTRYPOINT sandbox
