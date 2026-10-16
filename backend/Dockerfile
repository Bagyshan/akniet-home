# Build context: project root (see docker-compose.yml) — the backend also needs the page templates for server rendering

# Kyrgyz pages /ky/… from the Russian pages + i18n/ky.json
FROM node:22-alpine AS ky
WORKDIR /src
COPY index-stone.html ./
COPY technology/ technology/
COPY map/ map/
COPY projects/ projects/
COPY i18n/ i18n/
COPY scripts/build-ky.mjs scripts/
RUN node scripts/build-ky.mjs

FROM node:22-alpine AS build
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY backend/package.json ./
COPY backend/migrations ./migrations
COPY index-stone.html ./site/index.html
COPY technology/ ./site/technology/
COPY map/ ./site/map/
COPY projects/ ./site/projects/
COPY --from=ky /src/ky/ ./site/ky/
# uploads volume mounts here; the directory owner carries over to a new named volume
RUN mkdir -p /data/uploads && chown node:node /data/uploads
USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
