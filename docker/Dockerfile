FROM node:14
RUN git clone https://github.com/Henry-Chen0227/Hydro.git --recursive
RUN wget https://kr.hydro.ac/download/sandbox -O /usr/bin/sandbox
RUN chmod +x /usr/bin/sandbox
RUN cd root && yarn && yarn build:ui:production && npm -g install pm2
RUN chmod +x /root/run.sh
ENTRYPOINT /root/run.sh
