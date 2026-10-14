#!/bin/sh
# Первый выпуск сертификата Let's Encrypt. Запускать на сервере из корня проекта,
# когда DNS домена уже указывает на сервер и стек поднят: docker compose up -d --build
set -eu
. ./.env
: "${DOMAIN:?DOMAIN не задан в .env}" "${LETSENCRYPT_EMAIL:?LETSENCRYPT_EMAIL не задан в .env}"

# www.<домен> попадает в сертификат, только если у него уже есть DNS-запись (иначе Let's Encrypt откажет)
NAMES="-d $DOMAIN"
if getent hosts "www.$DOMAIN" >/dev/null 2>&1 || nslookup "www.$DOMAIN" >/dev/null 2>&1; then
  NAMES="$NAMES -d www.$DOMAIN"
else
  echo "www.$DOMAIN не найден в DNS — сертификат только для $DOMAIN"
fi

# --cert-name: сертификат всегда лежит в live/$DOMAIN; --expand: можно перевыпустить, добавив www позже
docker compose run --rm --entrypoint certbot certbot certonly \
  --webroot -w /var/www/certbot $NAMES --cert-name "$DOMAIN" --expand \
  --email "$LETSENCRYPT_EMAIL" --agree-tos --no-eff-email

# nginx при старте видит сертификат и включает HTTPS
docker compose restart nginx
echo "Готово: https://$DOMAIN"
