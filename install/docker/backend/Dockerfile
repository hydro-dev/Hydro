FROM node:20

COPY ./entrypoint.sh /root/entrypoint.sh

RUN yarn global add pm2 hydrooj @hydrooj/ui-default && \
    chmod +x /root/entrypoint.sh

ENTRYPOINT ["/root/entrypoint.sh"]
