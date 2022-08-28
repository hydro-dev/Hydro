FROM gitpod/workspace-mongodb
RUN npm i pm2 -g && \
    sudo apt-get update && \
    sudo apt-get install clang -y && \
    cargo install sonic-server --version 1.3.0 && \
    mkdir -p /home/gitpod/.hydro && \
    echo '{"host":"127.0.0.1","port":"27017","name":"hydro","username":"","password":""}' >/home/gitpod/.hydro/config.json && \
    mkdir -p /data/file && \
    chmod 777 /data/file
