FROM node:20
ADD ./entrypoint.sh /root/entrypoint.sh
RUN yarn global add pm2 hydrooj @hydrooj/ui-default
RUN chmod +x /root/entrypoint.sh && \
    mkdir -p /root/.hydro
ENTRYPOINT /root/entrypoint.sh
