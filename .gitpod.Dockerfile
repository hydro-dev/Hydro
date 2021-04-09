FROM gitpod/workspace-mongodb
RUN yarn global add pm2 && \
    wget https://dl.min.io/server/minio/release/linux-amd64/minio -O /usr/bin/minio && \
    chmod 755 /usr/bin/minio && \
    apt-get update && \
    apt-get install clang -y && \
    cargo install sonic-server && \
    echo '{"host":"127.0.0.1","port":"27017","name":"hydro","username":"","password":""}' >/home/gitpod/.hydro/config.json && \
    echo "MINIO_ACCESS_KEY=hydro\nMINIO_SECRET_KEY=hydrohydro" >/home/gitpod/.hydro/env
