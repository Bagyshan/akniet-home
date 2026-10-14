#!/bin/sh
# Runs before the stock 20-envsubst-on-templates.sh.
set -eu

# 1. Basic auth for /admin and /api/admin from ADMIN_USER / ADMIN_PASSWORD
: "${ADMIN_USER:?ADMIN_USER is not set}" "${ADMIN_PASSWORD:?ADMIN_PASSWORD is not set}"
printf '%s:%s\n' "$ADMIN_USER" "$(openssl passwd -apr1 "$ADMIN_PASSWORD")" > /etc/nginx/.htpasswd
chmod 640 /etc/nginx/.htpasswd && chown root:nginx /etc/nginx/.htpasswd

# 2. HTTPS once the Let's Encrypt certificate exists, plain HTTP before that (to pass the ACME challenge)
mkdir -p /etc/nginx/templates
if [ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
  cp /etc/nginx/tpl/https.conf.template /etc/nginx/templates/default.conf.template
  echo "akniet: HTTPS for ${DOMAIN}"
else
  cp /etc/nginx/tpl/http.conf.template /etc/nginx/templates/default.conf.template
  echo "akniet: no certificate for ${DOMAIN} yet — serving HTTP only"
fi

# 3. Pick up renewed certificates
(while :; do sleep 12h; nginx -s reload; done) &
