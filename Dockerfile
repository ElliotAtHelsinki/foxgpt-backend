FROM node:22.6.0

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY . .
COPY .env.production .env
ENV NODE_ENV production

EXPOSE 4000

CMD ["npm", "run", "start"]
