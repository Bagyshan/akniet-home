# Build context: project root (see docker-compose.yml)

# Kyrgyz page /ky/ from index-stone.html + i18n/ky.json
FROM node:22-alpine AS ky
WORKDIR /src
COPY index-stone.html ./
COPY i18n/ i18n/
COPY scripts/build-ky.mjs scripts/
RUN node scripts/build-ky.mjs

FROM nginx:1.27-alpine
RUN apk add --no-cache openssl
COPY nginx/templates/ /etc/nginx/tpl/
COPY nginx/snippets/ /etc/nginx/snippets/
COPY nginx/entrypoint/ /docker-entrypoint.d/
RUN chmod +x /docker-entrypoint.d/*.sh && rm -f /etc/nginx/conf.d/default.conf

# Site: index-stone.html is the home page; only the assets it uses
COPY index-stone.html /usr/share/nginx/html/index.html
COPY --from=ky /src/ky/index.html /usr/share/nginx/html/ky/index.html
COPY assets/stone/ /usr/share/nginx/html/assets/stone/
COPY assets/wood/ /usr/share/nginx/html/assets/wood/
COPY assets/map/ /usr/share/nginx/html/assets/map/
COPY assets/fonts/ /usr/share/nginx/html/assets/fonts/
COPY assets/3d-models/akniet-logo.js /usr/share/nginx/html/assets/3d-models/akniet-logo.js
COPY assets/mark-gold.png assets/logo-light.png assets/logo-gold.png assets/favicon.png /usr/share/nginx/html/assets/
COPY assets/icons/ /usr/share/nginx/html/assets/icons/
COPY assets/og/ /usr/share/nginx/html/assets/og/
COPY 404.html site.webmanifest /usr/share/nginx/html/
COPY admin/ /usr/share/nginx/admin/
