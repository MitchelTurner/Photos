# =============================================================================
# Railway API image (set Root Directory = server, builder = DOCKERFILE)
# =============================================================================
# Why Dockerfile instead of Nixpacks?
#   A root nixpacks.toml that set nixPkgs=["openssl"] previously REPLACED Node
#   with only OpenSSL, so `npm` was missing at build time. This image pins
#   node:22 + openssl for Prisma engines.
#
# What gets copied:
#   - Nest source → dist/
#   - prisma/ (migrations run on start:prod)
#   - public/ (gallery + admin HTML served by main.ts)
#
# UPLOAD_DIR=/data/uploads is a disk cache. Image bytes also live in Postgres
# (PhotoBlob). A Railway volume at /data/uploads is optional but recommended.
# =============================================================================
FROM node:22-bookworm-slim

# Prisma engines need OpenSSL
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma/
RUN npm ci

COPY . .
RUN npm run build \
  && npm prune --omit=dev

ENV NODE_ENV=production
ENV UPLOAD_DIR=/data/uploads
RUN mkdir -p /data/uploads
EXPOSE 3000

CMD ["npm", "run", "start:prod"]
