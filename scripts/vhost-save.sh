#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

READ_ONLY=""
DOMAIN=""
USERNAME=""
ROOT_DIR=""
RUNTIME="php"
PHP_VERSION="8.3"
APP_PORT=""
CUSTOM_CONFIG=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --read-only) READ_ONLY="1"; shift ;;
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --user|--username) USERNAME="${2:-}"; shift 2 ;;
    --root) ROOT_DIR="${2:-}"; shift 2 ;;
    --runtime) RUNTIME="${2:-}"; shift 2 ;;
    --php-version) PHP_VERSION="${2:-}"; shift 2 ;;
    --port) APP_PORT="${2:-}"; shift 2 ;;
    --config-file) CUSTOM_CONFIG="${2:-}"; shift 2 ;;
    *) fail "Argumen tidak dikenal: $1" ;;
  esac
done

require_root
require_domain "${DOMAIN}"

CONF_PATH="${MYCP_NGINX_DIR}/sites-available/${MYCP_NGINX_PREFIX}${DOMAIN}"

if [ -n "${READ_ONLY}" ]; then
  [ -f "${CONF_PATH}" ] || { echo "# Vhost not found"; exit 0; }
  cat "${CONF_PATH}"
  exit 0
fi

# Derive ROOT_DIR from USERNAME when not provided, lalu validasi konsisten
if [ -z "${ROOT_DIR}" ]; then
  if [ -z "${USERNAME}" ]; then
    fail "--root atau --username wajib diisi"
  fi
  ROOT_DIR="${MYCP_HOME_PREFIX}/${USERNAME}/htdocs"
fi
# Sanity check: ROOT_DIR harus berada di bawah home/<username>/htdocs (kalau username ada)
if [ -n "${USERNAME}" ]; then
  local expected="${MYCP_HOME_PREFIX}/${USERNAME}/htdocs"
  case "${ROOT_DIR}" in
    "${expected}"|"${expected}"/*) ;;
    *) fail "ROOT_DIR (${ROOT_DIR}) tidak konsisten dengan USERNAME (${USERNAME}); harus ${expected}[/...]" ;;
  esac
fi

need_cmd nginx
require_path "${ROOT_DIR}"

if [ "${RUNTIME}" = "laravel" ] || [ "${RUNTIME}" = "ci4" ]; then
  ROOT_DIR="${ROOT_DIR}/public"
fi

ENABLED_PATH="${MYCP_NGINX_DIR}/sites-enabled/${MYCP_NGINX_PREFIX}${DOMAIN}"

if [ -n "${CUSTOM_CONFIG}" ]; then
  [ -f "${CUSTOM_CONFIG}" ] || fail "File vhost tidak ditemukan: ${CUSTOM_CONFIG}"
  cp "${CUSTOM_CONFIG}" "${CONF_PATH}"
else
  case "${RUNTIME}" in
    php|laravel|codeigniter|ci4|ci3)
      # Prioritaskan socket pool per-site (mycp-<domain>.sock) kalau tersedia,
      # fallback ke socket global jika pool belum dibuat.
      POOL_SOCKET="${MYCP_SOCK_DIR}/mycp-${DOMAIN}.sock"
      # Tunggu sebentar kalau socket belum muncul (FPM mungkin masih reload)
      for i in 1 2 3; do
        [ -S "${POOL_SOCKET}" ] && break
        sleep 1
      done
      if [ -S "${POOL_SOCKET}" ]; then
        SOCKET="${POOL_SOCKET}"
      else
        SOCKET="$(php_fpm_socket "${PHP_VERSION}")"
        warn "Fallback ke global socket untuk ${DOMAIN}: ${SOCKET}"
      fi
      cat >"${CONF_PATH}" <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} www.${DOMAIN};

    root ${ROOT_DIR};

    access_log ${MYCP_LOG_DIR}/${DOMAIN}.access.log;
    error_log ${MYCP_LOG_DIR}/${DOMAIN}.error.log;

    location / {
        proxy_pass http://127.0.0.1:8088;
        proxy_set_header Host \$http_host;
        proxy_set_header X-Forwarded-Host \$http_host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_hide_header X-Varnish;
        proxy_redirect off;
        proxy_max_temp_file_size 0;
        proxy_connect_timeout      720;
        proxy_send_timeout         720;
        proxy_read_timeout         720;
        proxy_buffer_size          128k;
        proxy_buffers              4 256k;
        proxy_busy_buffers_size    256k;
        proxy_temp_file_write_size 256k;
    }

    location ~* ^.+\.(css|js|jpg|jpeg|gif|png|ico|gz|svg|svgz|ttf|otf|woff|woff2|eot|mp4|ogg|ogv|webm|webp|zip|swf|map)$ {
        add_header Access-Control-Allow-Origin "*";
        expires max;
        access_log off;
    }

    if (-f \$request_filename) {
        break;
    }
}

server {
    listen 8088;
    listen [::]:8088;
    server_name ${DOMAIN} www.${DOMAIN};
    root ${ROOT_DIR};

    try_files \$uri \$uri/ /index.php?\$args;
    index index.php index.html;

    location ~ \.php$ {
        include fastcgi_params;
        fastcgi_intercept_errors on;
        fastcgi_index index.php;
        fastcgi_param SCRIPT_FILENAME \$document_root\$fastcgi_script_name;
        try_files \$uri =404;
        fastcgi_read_timeout 3600;
        fastcgi_send_timeout 3600;
        fastcgi_param HTTPS "on";
        fastcgi_pass unix:${SOCKET};

        fastcgi_param PHP_VALUE "display_errors=1\nerror_reporting=E_ALL\nlog_errors=1";
    }

    if (-f \$request_filename) {
        break;
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

    access_log ${MYCP_LOG_DIR}/${DOMAIN}.access.log;
    error_log ${MYCP_LOG_DIR}/${DOMAIN}.error.log;

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

    access_log ${MYCP_LOG_DIR}/${DOMAIN}.access.log;
    error_log ${MYCP_LOG_DIR}/${DOMAIN}.error.log;

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
