FROM node:20-alpine AS builder
WORKDIR /app

# better-sqlite3 compile ses bindings natifs si aucun binaire prébuild ne correspond (alpine/musl)
RUN apk add --no-cache python3 make g++

COPY package.json ./
RUN npm install --omit=dev

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src

EXPOSE 3000
CMD ["node", "src/server.js"]
