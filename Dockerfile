FROM node:14

WORKDIR /root/Hydro

COPY ./ /root/Hydro/

RUN yarn && yarn build:ui

EXPOSE 8888

ENTRYPOINT ["yarn","start","--port=8888"]
