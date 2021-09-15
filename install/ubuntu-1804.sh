#!/bin/bash
name=bionic
echo "Running Hydro Installer for ubuntu 18.04"
echo "此脚本已不再维护，推荐使用新版安装工具："
echo "wget https://s3.undefined.moe/public/install -O install && chmod +x install && ./install"
echo "详情请参阅文档 -> https://hydro.js.org"
echo "使用 Ctrl-C 退出该脚本，或是等待十秒后继续。"
echo "Will continue installation in 10 secs, press Ctrl-C to exit"
sleep 10
MINIO_ACCESS_KEY=$(cat /dev/urandom | head -n 10 | md5sum | head -c 20)
MINIO_SECRET_KEY=$(cat /dev/urandom | head -n 10 | md5sum | head -c 20)

# Basic
echo "apt-get update"
apt-get -qq update
echo "apt-get install curl wget gnupg -y"
apt-get install -y curl wget gnupg >/dev/null
wget -qO - https://www.mongodb.org/static/pgp/server-4.4.asc | apt-key add -
echo "deb [ arch=amd64 ] https://mirrors.tuna.tsinghua.edu.cn/mongodb/apt/ubuntu $name/mongodb-org/4.4 multiverse" | tee /etc/apt/sources.list.d/mongodb-org-4.4.list
echo "apt-get update"
apt-get -qq update
mkdir -p /data/db /data/file

# Install NodeJS
echo "Installing NodeJS"
curl -o- https://cdn.jsdelivr.net/gh/nvm-sh/nvm@v0.36.0/install.sh | sed 's/raw.githubusercontent.com\/nvm-sh\/nvm\//cdn.jsdelivr.net\/gh\/nvm-sh\/nvm@/g' | sed 's/github.com\/nvm-sh\/nvm.git/gitee.com\/imirror\/nvm/g' | bash
export NVM_DIR=/root/.nvm
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
NVM_NODEJS_ORG_MIRROR=https://mirrors.tuna.tsinghua.edu.cn/nodejs-release nvm install 14
nvm use 14
npm i yarn -g
echo "Installing pm2"
yarn global add pm2

# Install MongoDB
echo "Installing MongoDB"
db_password=$(cat /dev/urandom | head -n 10 | md5sum | head -c 20)
apt-get -qq install -y mongodb-org
echo "db.createUser({
  user: 'hydro',
  pwd: '$db_password',
  roles: [
    { role: 'readWrite', db: 'hydro' }
  ]
})" >/tmp/createUser.js
echo "pm2 start mongod"
pm2 start mongod >/dev/null
sleep 2
mongo 127.0.0.1:27017/hydro /tmp/createUser.js
rm /tmp/createUser.js
echo "pm2 stop mongod"
pm2 stop mongod >/dev/null
pm2 del mongod >/dev/null
echo 'Starting mongodb'
pm2 start "mongod --auth --bind_ip 0.0.0.0" --name mongodb

# Install MinIO
wget http://dl.minio.org.cn/server/minio/release/linux-amd64/minio
chmod +x minio
pm2 start "MINIO_ACCESS_KEY=$MINIO_ACCESS_KEY MINIO_SECRET_KEY=$MINIO_SECRET_KEY ./minio server /data/file" --name minio

# Install Compiler
echo 'Installing g++'
apt-get install -y g++ >/dev/null

# Install HydroOJ
echo "Installing Hydro"
yarn global add hydrooj @hydrooj/ui-default @hydrooj/hydrojudge
wget https://s3.undefined.moe/file/executor-amd64 -O /usr/bin/sandbox
chmod +x /usr/bin/sandbox
pm2 start sandbox
mkdir ~/.hydro
echo "{\"host\":\"127.0.0.1\",\"port\":\"27017\",\"name\":\"hydro\",\"username\":\"hydro\",\"password\":\"$db_password\"}" >~/.hydro/config.json
echo '["@hydrooj/ui-default","@hydrooj/hydrojudge"]' >~/.hydro/addon.json
pm2 start hydrooj

pm2 startup
pm2 save

# Done
echo "Done"
echo "Database username: hydro"
echo "Database password: $db_password"
echo "MINIO_ACCESS_KEY=$MINIO_ACCESS_KEY
MINIO_SECRET_KEY=$MINIO_SECRET_KEY" >~/.hydro/env
