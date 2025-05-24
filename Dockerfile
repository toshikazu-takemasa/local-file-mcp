FROM node:22-slim AS builder

WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./
COPY src/ ./src/

RUN npm ci && \
  npm run build && \
  npm prune --production

FROM node:22-slim

RUN apt-get update && apt-get install -y socat

WORKDIR /app
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

EXPOSE 3000

ENTRYPOINT ["/usr/bin/socat", "TCP-LISTEN:3000,fork,reuseaddr", "EXEC:'/usr/local/bin/node dist/index.js'"]
