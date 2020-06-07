FROM mhart/alpine-node:slim-10
WORKDIR /app
ADD .build /app
EXPOSE 8888
CMD ["node", ".build/development.js"]
