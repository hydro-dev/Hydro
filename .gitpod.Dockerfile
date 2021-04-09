FROM gitpod/workspace-mongodb
RUN npm i pm2 -g && \
    sudo wget https://dl.min.io/server/minio/release/linux-amd64/minio -O /usr/bin/minio && \
    sudo chmod 755 /usr/bin/minio && \
    sudo apt-get update && \
    sudo apt-get install clang -y && \
    cargo install sonic-server --version 1.3.0 && \
    mkdir -p /home/gitpod/.hydro && \
    echo '{"host":"127.0.0.1","port":"27017","name":"hydro","username":"","password":""}' >/home/gitpod/.hydro/config.json && \
    echo "MINIO_ACCESS_KEY=hydro\nMINIO_SECRET_KEY=hydrohydro" >/home/gitpod/.hydro/env
