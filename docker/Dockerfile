FROM node:14
COPY run.sh /root/run.sh
COPY .ssh /root/.ssh
RUN wget https://kr.hydro.ac/download/sandbox -O /usr/bin/sandbox
RUN chmod +x /usr/bin/sandbox
RUN npm -g install pm2
RUN chmod +x /root/run.sh
ENTRYPOINT /root/run.sh
