# Crossimage Product OS — 本番用イメージ（web をビルドし、server が静的配信する単一プロセス構成）

# ---- Stage 1: フロントエンドをビルド ----
FROM node:20-slim AS webbuild
WORKDIR /build
COPY app/shared ./shared
COPY app/web ./web
WORKDIR /build/web
RUN npm ci && npm run build

# ---- Stage 2: サーバー実行環境 ----
FROM node:20-slim
# better-sqlite3 のネイティブビルドが必要になった場合に備えてツールチェーンを同梱
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app/server
COPY app/server/package.json app/server/package-lock.json ./
RUN npm ci
COPY app/server ./
COPY app/shared /app/shared
COPY --from=webbuild /build/web/dist /app/web/dist

# SQLite は永続ディスク（Render の Disk を /data にマウント）に置く
ENV DATA_DIR=/data
EXPOSE 8787
CMD ["npx", "tsx", "src/index.ts"]
