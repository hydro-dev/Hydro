#!/bin/bash

echo "Running Hydro Installer for ubuntu 16.04"
db_password=$(cat /dev/urandom | head -n 10 | md5sum | head -c 20)

# Basic
echo "apt-get update"
apt-get -qq update
echo "apt-get install curl wget gnupg -y"
apt-get install -y curl wget gnupg >/dev/null
apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv 9DA31620334BD75D9DCB49F368818C72E52529D4
echo "deb [ arch=amd64 ] https://repo.mongodb.org/apt/ubuntu xenial/mongodb-org/4.0 multiverse" | tee /etc/apt/sources.list.d/mongodb-org-4.0.list
echo "apt-get update"
apt-get -qq update

# Install NodeJS
echo "Installing NodeJS"
curl -o- https://cdn.jsdelivr.net/gh/nvm-sh/nvm@v0.36.0/install.sh | sed 's/raw.githubusercontent.com\/nvm-sh\/nvm\//cdn.jsdelivr.net\/gh\/nvm-sh\/nvm@/g' | bash
export NVM_DIR=/root/.nvm
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm install 14
nvm use 14
npm i yarn -g
echo "Installing pm2"
yarn global add pm2

# Install MongoDB
echo "Installing MongoDB"
apt-get -qq install -y mongodb-org
mkdir -p /data/db
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

# Install Compiler
echo 'Installing g++'
apt-get install -y g++ >/dev/null

# Install HydroOJ
# TODO: install basic addons?
echo "Installing Hydro"
yarn global add hydrooj @hydrooj/ui-default @hydrooj/hydrojudge
wget https://github.com/criyle/go-judge/releases/download/v0.7.1/executorserver-amd64 -O /usr/bin/sandbox
chmod +x /usr/bin/sandbox
pm2 start "/usr/bin/sandbox"
mkdir ~/.hydro
echo "{\"host\":\"127.0.0.1\",\"port\":\"27017\",\"name\":\"hydro\",\"username\":\"hydro\",\"password\":\"$db_password\"}" >~/.hydro/config.json
echo '["@hydrooj/ui-default","@hydrooj/hydrojudge"]' >~/.hydro/addon.json
pm2 start hydrooj

# Done
echo "Done"
echo "Database username: hydro"
echo "Database password: $db_password"
