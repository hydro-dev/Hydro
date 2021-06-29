#!/bin/bash

echo "Running Hydro Installer for centos 7"
echo "CENTOS IS NOT RECOMMENDED TO USE."
echo "PLEASE USE UBUNTU INSTEAD."
echo "THIS SCRIPT MAY NOT WORK PROPERLY."
echo "Will continue installation in 10 secs, press Ctrl-C to exit"
echo "非常不推荐使用CentOS！"
echo "请切换到 ubuntu 操作系统！"
echo "此脚本可能无法正常工作"
echo "使用 Ctrl-C 退出该脚本。"
sleep 10
db_password=$(cat /dev/urandom | head -n 10 | md5sum | head -c 20)
MINIO_ACCESS_KEY=$(cat /dev/urandom | head -n 10 | md5sum | head -c 20)
MINIO_SECRET_KEY=$(cat /dev/urandom | head -n 10 | md5sum | head -c 20)

# Basic
yum install wget
mkdir -p /etc/yum.repos.d
echo "[mongodb-org-4.4]
name=MongoDB Repository
baseurl=https://repo.mongodb.org/yum/redhat/7/mongodb-org/4.4/x86_64/
gpgcheck=1
enabled=1
gpgkey=https://www.mongodb.org/static/pgp/server-4.4.asc" >/etc/yum.repos.d/mongodb-org-4.4.repo
echo "yum install -y mongodb-org"
yum install -y mongodb-org
mkdir -p /var/lib/mongo
mkdir -p /var/log/mongodb
mkdir -p /data/db
chown -R mongod:mongod /var/lib/mongo /var/log/mongodb /data/db
echo user.max_user_namespaces=10000 >> /etc/sysctl.d/98-userns.conf
sysctl -p

# Install NodeJS
echo "Installing NodeJS"
curl -o- https://cdn.jsdelivr.net/gh/nvm-sh/nvm@v0.36.0/install.sh | sed 's/raw.githubusercontent.com\/nvm-sh\/nvm\//cdn.jsdelivr.net\/gh\/nvm-sh\/nvm@/g' | sed 's/github.com\/nvm-sh\/nvm.git/gitee.com\/imirror\/nvm/g' | bash
export NVM_DIR=/root/.nvm
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm install 14
nvm use 14
npm i yarn -g
echo "Installing pm2"
yarn global add pm2

# Install MongoDB
echo "Installing MongoDB"
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
echo 'pm2 start "mongod --auth"'
pm2 start "mongod --auth"

# Install MinIO
echo 'Installing MinIO'
wget http://dl.minio.org.cn/server/minio/release/linux-amd64/minio
chmod +x minio
mkdir -p /data/file
pm2 start "./minio server /data/file" --name minio

# Install HydroOJ
# TODO: install basic addons?
echo "Installing Hydro"
yarn global add hydrooj @hydrooj/ui-default @hydrooj/hydrojudge
wget https://s3.undefined.moe/file/executor-amd64 -O /usr/bin/sandbox_
chmod +x /usr/bin/sandbox_
pm2 start "/usr/bin/sandbox_"
mkdir ~/.hydro
echo "{\"host\":\"127.0.0.1\",\"port\":\"27017\",\"name\":\"hydro\",\"username\":\"hydro\",\"password\":\"$db_password\"}" >~/.hydro/config.json
echo '["@hydrooj/ui-default","@hydrooj/hydrojudge"]' >~/.hydro/addon.json
pm2 start hydrooj

# Done
echo "Done"
echo "Database username: hydro"
echo "Database password: $db_password"
echo "MINIO_ACCESS_KEY=$MINIO_ACCESS_KEY
MINIO_SECRET_KEY=$MINIO_SECRET_KEY" >~/.hydro/env
