FROM mcr.microsoft.com/vscode/devcontainers/typescript-node:22-bookworm

RUN install -d -o root -g root /root/.hydro /data/file \
    && cat <<'EOF' > /root/.hydro/config.json
{"uri":"mongodb://mongo/hydro"}
EOF \
    && cat <<'EOF' > /root/.hydro/addon.json
["@hydrooj/ui-default","@hydrooj/hydrojudge"]
EOF
