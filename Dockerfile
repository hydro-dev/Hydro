FROM mhart/alpine-node:slim-10
WORKDIR /app
ADD .uibuild dist locales templates /app/
RUN mkdir /config 
VOLUME [ "/config" ]
EXPOSE 8888
CMD ["node", "dist/development.js"]
