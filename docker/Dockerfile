FROM node:14
COPY run.sh /root/run.sh
RUN wget https://kr.hydro.ac/download/sandbox -O /usr/bin/sandbox
RUN chmod +x /usr/bin/sandbox
RUN npm -g install pm2 --registry=https://registry.npm.taobao.org
RUN chmod +x /root/run.sh
ENTRYPOINT /root/run.sh
