#!/bin/sh
# Первый выпуск сертификата Let's Encrypt. Запускать на сервере из корня проекта,
# когда DNS домена уже указывает на сервер и стек поднят: docker compose up -d --build
set -eu
. ./.env
: "${DOMAIN:?DOMAIN не задан в .env}" "${LETSENCRYPT_EMAIL:?LETSENCRYPT_EMAIL не задан в .env}"

# Let's Encrypt проверяет домен по http://<домен>:80, поэтому сначала убеждаемся, что nginx оттуда отвечает
if [ "${HTTP_PORT:-80}" != "80" ]; then
  echo "Ошибка: в .env HTTP_PORT=${HTTP_PORT}. Let's Encrypt ходит только на порт 80 — поставьте HTTP_PORT=80 и выполните docker compose up -d"; exit 1
fi
if [ -z "$(docker compose ps -q --status running nginx)" ]; then
  echo "Ошибка: контейнер nginx не запущен. Последние строки его лога:"
  docker compose logs --tail 30 nginx || true
  echo "Запустите стек: docker compose up -d --build"; exit 1
fi
if [ "${SKIP_CHECK:-}" != "1" ]; then
  docker compose run --rm --entrypoint sh certbot -c \
    'mkdir -p /var/www/certbot/.well-known/acme-challenge && echo ok > /var/www/certbot/.well-known/acme-challenge/akniet-check' >/dev/null
  URL="http://$DOMAIN/.well-known/acme-challenge/akniet-check"
  if curl -fsS --max-time 10 "$URL" 2>/dev/null | grep -q ok || wget -qO- -T 10 "$URL" 2>/dev/null | grep -q ok; then
    echo "Проверка: $URL отвечает"
  else
    echo "Ошибка: $URL не открывается — Let's Encrypt тоже не достучится."
    echo "  DNS:      $(getent hosts "$DOMAIN" || echo 'не найден') (должен быть IP этого сервера)"
    echo "  Порт 80:  $(docker compose port nginx 80 || echo 'не проброшен')"
    echo "  Проверьте фаервол (ufw allow 80,443/tcp) и что порт 80 не занят другим веб-сервером (ss -ltnp | grep ':80 ')."
    echo "  Если уверены, что снаружи сайт открывается, запустите с SKIP_CHECK=1."
    exit 1
  fi
fi

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
