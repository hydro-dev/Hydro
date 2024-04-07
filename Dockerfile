FROM node:20-alpine

WORKDIR /codemate-core/
COPY . .
RUN yarn &&\
    yarn build:ui:production &&\
    npx hydrooj addon add @hydrooj/ui-default &&\
    echo '{"uri": "mongodb://root:db_password@mongo:27017/"}' > /root/.hydro/config.json

ENTRYPOINT ["yarn", "start"]
