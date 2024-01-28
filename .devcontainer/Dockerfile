FROM mcr.microsoft.com/vscode/devcontainers/typescript-node:20-bookworm
ADD https://github.com/criyle/go-judge/releases/download/v1.8.0/go-judge_1.8.0_linux_amd64 /usr/bin/sandbox
RUN npm install -g yarn && \
    sudo apt-get update && sudo apt-get install gcc g++ && \
    mkdir -p /root/.hydro /data/file && chmod +x /usr/bin/sandbox && \
    chown -R root:root /root /root/.hydro /data/file && \
    echo '{"uri":"mongodb://mongo/hydro"}' > /root/.hydro/config.json && \
    echo '["@hydrooj/ui-default","@hydrooj/hydrojudge"]' > /root/.hydro/addon.json
ENTRYPOINT sandbox
