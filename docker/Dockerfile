FROM node:14
# COPY . /root
RUN wget https://s3.undefined.moe/file/executor-amd64 -O /usr/bin/sandbox
RUN chmod +x /usr/bin/sandbox
RUN cd root && yarn && yarn build:ui:production && npm -g install pm2
RUN chmod +x /root/run.sh
ENTRYPOINT /root/run.sh
