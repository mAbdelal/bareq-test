FROM node:latest

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install

COPY prisma ./prisma
RUN npx prisma generate

COPY . .

EXPOSE 8080

CMD ["sh", "-c", "node server.js"]
# CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed && node server.js"]