FROM node:24

WORKDIR /app

COPY package*.json ./

RUN npm install --omit=dev

COPY backend ./backend
COPY frontend ./frontend
COPY database ./database

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "backend/server.js"]