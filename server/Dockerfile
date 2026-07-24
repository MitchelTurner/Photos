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
EXPOSE 3000

CMD ["npm", "run", "start:prod"]
