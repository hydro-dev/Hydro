#!/bin/bash

# Basic
apt-get update
apt-get install curl wget unzip gnupg -y
apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv 9DA31620334BD75D9DCB49F368818C72E52529D4
echo "deb [ arch=amd64 ] https://repo.mongodb.org/apt/ubuntu bionic/mongodb-org/4.0 multiverse" | tee /etc/apt/sources.list.d/mongodb-org-4.0.list
apt-get update

# Install MongoDB
apt-get install -y mongodb-org
apt-get clean
mkdir -p /data/db

# Install NodeJS
curl -o- https://cdn.jsdelivr.net/gh/nvm-sh/nvm@v0.36.0/install.sh | sed 's/raw.githubusercontent.com\/nvm-sh\/nvm\//cdn.jsdelivr.net\/gh\/nvm-sh\/nvm@/g' | bash
export NVM_DIR=/root/.nvm
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm install 14
nvm use 14

# Install HydroOJ
npm i yarn -g
# TODO: install basic addons?
yarn global add hydrooj @hydrooj/ui-default @hydrooj/hydrojudge

# TODO: auto-config & start? pm2 daemon?

# Finish
echo "Done! use 'hydrooj' to start."

# TODO: install judge
