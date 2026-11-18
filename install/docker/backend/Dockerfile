FROM node:22

RUN sed -i 's|deb.debian.org|mirrors.tuna.tsinghua.edu.cn|g' /etc/apt/sources.list.d/debian.sources \
    && sed -i 's|security.debian.org|mirrors.tuna.tsinghua.edu.cn/debian-security|g' /etc/apt/sources.list.d/debian.sources

# yarn 换淘宝镜像
RUN yarn config set registry https://registry.npmmirror.com

COPY ./entrypoint.sh /root/entrypoint.sh

RUN yarn global add pm2 hydrooj @hydrooj/ui-default && \
    chmod +x /root/entrypoint.sh

ENTRYPOINT ["/root/entrypoint.sh"]
