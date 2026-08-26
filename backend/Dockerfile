FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx prisma generate
RUN npx esbuild src/index.ts --bundle --platform=node --target=node20 --format=esm --outfile=dist/server.js --external:@prisma/client --external:prisma --external:node:* --packages=external

FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

RUN apk add --no-cache dumb-init curl

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

RUN mkdir -p uploads/logos && chown -R node:node /app

COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

ENTRYPOINT ["dumb-init", "./docker-entrypoint.sh"]
