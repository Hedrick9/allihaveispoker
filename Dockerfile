FROM node:22-alpine AS builder
WORKDIR /app
COPY client/package*.json ./client/
RUN npm install --prefix client
COPY client ./client
RUN npm run build --prefix client

FROM node:22-alpine
WORKDIR /app
COPY server/package*.json ./server/
RUN npm install --prefix server --omit=dev
COPY server ./server
COPY --from=builder /app/client/dist ./client/dist
EXPOSE 3001
CMD ["node", "server/index.js"]  
  
  
  
  
  
  
  
  
  
  
  
  
  
  

  
  
  
  

  
  
  
  
  
  
  
  
  
  
  
  

  
  
  
