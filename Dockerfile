FROM node:24-bookworm-slim AS builder
WORKDIR /build

ENV npm_config_update_notifier=false

COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --no-audit --no-fund

COPY tsconfig.base.json ./
COPY shared/ shared/
COPY server/ server/
COPY web/ web/

RUN npm run build --workspace web \
 && npm run build --workspace server

FROM node:24-bookworm-slim AS deps
WORKDIR /build

ENV npm_config_update_notifier=false

COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --omit=dev --no-audit --no-fund --workspace server --include-workspace-root

FROM node:24-bookworm-slim AS runner
WORKDIR /app

ENV PORT=8080 \
    HOST=0.0.0.0 \
    DATA_DIR=/data \
    TZ=Europe/Moscow \
    npm_config_update_notifier=false

COPY --from=deps /build/node_modules ./node_modules
COPY --from=builder /build/server/dist ./dist
COPY --from=builder /build/server/drizzle ./drizzle
COPY --from=builder /build/web/dist ./public
COPY server/package.json ./package.json

RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]
USER node

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
