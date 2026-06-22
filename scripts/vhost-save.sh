#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

DOMAIN=""
ROOT_DIR=""
RUNTIME="php"
PHP_VERSION="8.3"
APP_PORT=""
CUSTOM_CONFIG=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --root) ROOT_DIR="${2:-}"; shift 2 ;;
    --runtime) RUNTIME="${2:-}"; shift 2 ;;
    --php-version) PHP_VERSION="${2:-}"; shift 2 ;;
    --port) APP_PORT="${2:-}"; shift 2 ;;
    --config-file) CUSTOM_CONFIG="${2:-}"; shift 2 ;;
    *) fail "Argumen tidak dikenal: $1" ;;
  esac
done

require_root
need_cmd nginx
require_domain "${DOMAIN}"
require_path "${ROOT_DIR}"

CONF_PATH="/etc/nginx/sites-available/${MYCP_NGINX_PREFIX}${DOMAIN}"
ENABLED_PATH="/etc/nginx/sites-enabled/${MYCP_NGINX_PREFIX}${DOMAIN}"

if [ -n "${CUSTOM_CONFIG}" ]; then
  [ -f "${CUSTOM_CONFIG}" ] || fail "File vhost tidak ditemukan: ${CUSTOM_CONFIG}"
  cp "${CUSTOM_CONFIG}" "${CONF_PATH}"
else
  case "${RUNTIME}" in
    php|laravel|codeigniter|ci4|ci3)
      SOCKET="$(php_fpm_socket "${PHP_VERSION}")"
      cat >"${CONF_PATH}" <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} www.${DOMAIN};

    root ${ROOT_DIR};
    index index.php index.html;

    access_log /var/log/nginx/${DOMAIN}.access.log;
    error_log /var/log/nginx/${DOMAIN}.error.log;

    location / {
        try_files \$uri \$uri/ /index.php?\$query_string;
    }

    location ~ \.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:${SOCKET};
    }

    location ~ /\. {
        deny all;
    }
}
NGINX
      ;;
    node|reverse-proxy)
      [ -n "${APP_PORT}" ] || fail "--port wajib untuk runtime node/reverse-proxy"
      cat >"${CONF_PATH}" <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} www.${DOMAIN};

    access_log /var/log/nginx/${DOMAIN}.access.log;
    error_log /var/log/nginx/${DOMAIN}.error.log;

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINX
      ;;
    static|html)
      cat >"${CONF_PATH}" <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} www.${DOMAIN};

    root ${ROOT_DIR};
    index index.html;

    access_log /var/log/nginx/${DOMAIN}.access.log;
    error_log /var/log/nginx/${DOMAIN}.error.log;

    location / {
        try_files \$uri \$uri/ =404;
    }

    location ~ /\. {
        deny all;
    }
}
NGINX
      ;;
    *) fail "Runtime tidak didukung: ${RUNTIME}" ;;
  esac
fi

ln -sfn "${CONF_PATH}" "${ENABLED_PATH}"
reload_nginx
log "Vhost tersimpan: ${DOMAIN}"
