FROM mhart/alpine-node:slim-10
WORKDIR /app
ADD .uibuild .build /app/
RUN mkdir /config 
VOLUME [ "/config" ]
EXPOSE 8888
CMD ["node", ".build/development.js"]
