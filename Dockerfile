FROM node:14
RUN npm add -g pm2 && yarn && yarn build:ui:production && pm2 start "yarn start --port=8888" --name hydrooj
