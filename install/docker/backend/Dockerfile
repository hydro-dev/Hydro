FROM node:14
ADD ./entrypoint.sh /root/entrypoint.sh
RUN yarn global add pm2 hydrooj @hydrooj/ui-default
RUN chmod +x /root/entrypoint.sh
ENTRYPOINT /root/entrypoint.sh
