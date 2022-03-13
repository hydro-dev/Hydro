FROM node:14
COPY run.sh /root/run.sh
COPY .ssh /root/.ssh
RUN git clone git@github.com:Henry-Chen0227/Hydro.git /root/Hydro --recursive
RUN wget https://kr.hydro.ac/download/sandbox -O /usr/bin/sandbox
RUN chmod +x /usr/bin/sandbox
RUN cd root/Hydro && yarn && yarn build:ui:production && npm -g install pm2
RUN chmod +x /root/run.sh
ENTRYPOINT /root/run.sh
