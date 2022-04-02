FROM node:14
COPY run.sh /root/run.sh
RUN sed -i s/deb.debian.org/mirrors.tencentyun.com/g /etc/apt/sources.list && sed -i s/security.debian.org/mirrors.tencentyun.com/g /etc/apt/sources.list
RUN wget https://kr.hydro.ac/download/sandbox -O /usr/bin/sandbox
RUN apt update && apt install zip git g++ -y
RUN chmod +x /usr/bin/sandbox
RUN npm -g install pm2 --registry=https://registry.npm.taobao.org
RUN chmod +x /root/run.sh
ENTRYPOINT /root/run.sh
