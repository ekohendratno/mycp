#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

DOMAIN=""
USERNAME=""
PASSWORD=""
RUNTIME="php"
PHP_VERSION="8.4"
NODE_VERSION="20"
LARAVEL_VERSION=""
DB_TYPE="none"
APP_PORT="80"
SSL_ENABLED="no"
FTP_ENABLED="yes"
CLONE_SOURCE="no"
ROOT_DIR=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --user|--username) USERNAME="${2:-}"; shift 2 ;;
    --password) PASSWORD="${2:-}"; shift 2 ;;
    --runtime) RUNTIME="${2:-}"; shift 2 ;;
    --php-version) PHP_VERSION="${2:-}"; shift 2 ;;
    --node-version) NODE_VERSION="${2:-}"; shift 2 ;;
    --database) DB_TYPE="${2:-}"; shift 2 ;;
    --port) APP_PORT="${2:-}"; shift 2 ;;
    --ssl) SSL_ENABLED="${2:-yes}"; shift 2 ;;
    --ftp) FTP_ENABLED="${2:-yes}"; shift 2 ;;
    --clone-source) CLONE_SOURCE="${2:-no}"; shift 2 ;;
    --laravel-version) LARAVEL_VERSION="${2:-}"; shift 2 ;;
    --root) ROOT_DIR="${2:-}"; shift 2 ;;
    *) fail "Argumen tidak dikenal: $1" ;;
  esac
done

require_root
need_cmd useradd
need_cmd nginx
require_domain "${DOMAIN}"
require_user "${USERNAME}"

[ -n "${PASSWORD}" ] || fail "--password wajib diisi"
[ -n "${ROOT_DIR}" ] || ROOT_DIR="${MYCP_HOME_PREFIX}/${USERNAME}/htdocs"
require_path "${ROOT_DIR}"

if id "${USERNAME}" >/dev/null 2>&1; then
  log "User ${USERNAME} sudah ada"
else
  useradd -m -s /bin/bash "${USERNAME}"
fi

echo "${USERNAME}:${PASSWORD}" | chpasswd
usermod -aG www-data "${USERNAME}" || true
mkdir -p "${ROOT_DIR}"
mkdir -p "${MYCP_HOME_PREFIX}/${USERNAME}/tmp"
chown -R "${USERNAME}:${USERNAME}" "${MYCP_HOME_PREFIX}/${USERNAME}"
chmod 755 "${MYCP_HOME_PREFIX}/${USERNAME}" "${ROOT_DIR}" "${MYCP_HOME_PREFIX}/${USERNAME}/tmp"

if [ "${CLONE_SOURCE}" = "yes" ]; then
  case "${RUNTIME}" in
    laravel)
      if [ ! -f "${ROOT_DIR}/artisan" ]; then
        LARAVEL_REQ="laravel/laravel"
        [ -n "${LARAVEL_VERSION}" ] && LARAVEL_REQ="laravel/laravel:^${LARAVEL_VERSION}"
        su - "${USERNAME}" -c "composer create-project ${LARAVEL_REQ} ${ROOT_DIR} --no-interaction --no-dev 2>&1" || log "WARNING: composer create-project laravel/laravel gagal"
        chmod -R 775 "${ROOT_DIR}/storage" "${ROOT_DIR}/bootstrap/cache" 2>/dev/null || true
        su - "${USERNAME}" -c "php ${ROOT_DIR}/artisan key:generate 2>&1" || true
        # Konfigurasi .env sesuai database yang dipilih
        if [ -f "${ROOT_DIR}/.env" ]; then
          if [ "${DB_TYPE}" = "mysql" ] || [ "${DB_TYPE}" = "mariadb" ]; then
            DB_NAME="${USERNAME}_db"
            DB_USER="${USERNAME}_dbu"
            sed -i "s/DB_CONNECTION=.*/DB_CONNECTION=mysql/" "${ROOT_DIR}/.env"
            sed -i "s/# DB_HOST=.*/DB_HOST=127.0.0.1/" "${ROOT_DIR}/.env"
            sed -i "s/DB_HOST=.*/DB_HOST=127.0.0.1/" "${ROOT_DIR}/.env"
            sed -i "s/# DB_PORT=.*/DB_PORT=3306/" "${ROOT_DIR}/.env"
            sed -i "s/DB_PORT=.*/DB_PORT=3306/" "${ROOT_DIR}/.env"
            sed -i "s/# DB_DATABASE=.*/DB_DATABASE=${DB_NAME}/" "${ROOT_DIR}/.env"
            sed -i "s/DB_DATABASE=.*/DB_DATABASE=${DB_NAME}/" "${ROOT_DIR}/.env"
            sed -i "s/# DB_USERNAME=.*/DB_USERNAME=${DB_USER}/" "${ROOT_DIR}/.env"
            sed -i "s/DB_USERNAME=.*/DB_USERNAME=${DB_USER}/" "${ROOT_DIR}/.env"
            sed -i "s/# DB_PASSWORD=.*/DB_PASSWORD=${PASSWORD}/" "${ROOT_DIR}/.env"
            sed -i "s/DB_PASSWORD=.*/DB_PASSWORD=${PASSWORD}/" "${ROOT_DIR}/.env"
          fi
          chown "${USERNAME}:${USERNAME}" "${ROOT_DIR}/.env"
        fi
        chown -R "${USERNAME}:www-data" "${ROOT_DIR}/storage" "${ROOT_DIR}/bootstrap/cache" 2>/dev/null || true
      fi ;;
    "codeigniter 4"|ci4)
      if [ ! -f "${ROOT_DIR}/spark" ]; then
        su - "${USERNAME}" -c "composer create-project codeigniter4/appstarter ${ROOT_DIR} --no-interaction --no-dev 2>&1" || log "WARNING: composer create-project codeigniter4/appstarter gagal"
        chown -R "${USERNAME}:${USERNAME}" "${ROOT_DIR}" 2>/dev/null || true
      fi ;;
    "codeigniter 3"|ci3)
      if [ ! -f "${ROOT_DIR}/index.php" ]; then
        CI3_URL="https://github.com/bcit-ci/CodeIgniter/archive/refs/tags/3.1.13.zip"
        TMP_ZIP="/tmp/ci3-${DOMAIN}.zip"
        wget -q "${CI3_URL}" -O "${TMP_ZIP}" 2>/dev/null || curl -sL "${CI3_URL}" -o "${TMP_ZIP}" || true
        if [ -f "${TMP_ZIP}" ]; then
          TMP_DIR="/tmp/ci3-extract-${DOMAIN}"
          mkdir -p "${TMP_DIR}"
          unzip -q "${TMP_ZIP}" -d "${TMP_DIR}" 2>/dev/null || true
          cp -r "${TMP_DIR}/CodeIgniter-3.1.13/"* "${ROOT_DIR}/" 2>/dev/null || true
          rm -rf "${TMP_DIR}" "${TMP_ZIP}"
          chown -R "${USERNAME}:${USERNAME}" "${ROOT_DIR}" 2>/dev/null || true
        fi
      fi ;;
    node)
      if [ ! -f "${ROOT_DIR}/package.json" ]; then
        su - "${USERNAME}" -c "cd '${ROOT_DIR}' && npm init -y 2>&1" || true
      fi ;;
  esac
fi

# Default landing page + startup untuk Node.js
if [ "${RUNTIME}" = "node" ]; then
  if [ ! -f "${ROOT_DIR}/server.js" ] && [ ! -f "${ROOT_DIR}/index.html" ] && [ ! -f "${ROOT_DIR}/app.js" ]; then
    sed "s/__DOMAIN__/${DOMAIN}/g; s/__PORT__/${APP_PORT}/g" "${SCRIPT_DIR}/../templates/node-server.js.template" > "${ROOT_DIR}/server.js"
    chown "${USERNAME}:${USERNAME}" "${ROOT_DIR}/server.js"
    chmod +x "${ROOT_DIR}/server.js"
  fi
  # Start via PM2 jika belum jalan
  su - "${USERNAME}" -c "pm2 start '${ROOT_DIR}/server.js' --name '${DOMAIN}' --silent 2>&1" || true
  su - "${USERNAME}" -c "pm2 save --silent 2>&1" || true
elif [ ! -f "${ROOT_DIR}/index.html" ] && [ ! -f "${ROOT_DIR}/index.php" ]; then
  sed "s|__DOMAIN__|${DOMAIN}|g" "${SCRIPT_DIR}/../templates/index.php.template" > "${ROOT_DIR}/index.php"
  chown "${USERNAME}:${USERNAME}" "${ROOT_DIR}/index.php"
fi

# Buat PHP-FPM pool khusus website ini (supaya setting php.ini per-site berlaku)
case "${RUNTIME}" in
  php|laravel|codeigniter|ci4|ci3)
  "${SCRIPT_DIR}/phpini-save.sh" \
    --domain "${DOMAIN}" \
    --user "${USERNAME}" \
    --php-version "${PHP_VERSION}" \
    --set "memory_limit=512M" \
    --set "max_execution_time=60" \
    --set "upload_max_filesize=64M" \
    --set "post_max_size=64M" \
    --set "display_errors=on" || log "WARNING: phpini-save.sh gagal, pool mungkin belum terbuat"
    ;;
esac

"${SCRIPT_DIR}/vhost-save.sh" \
  --domain "${DOMAIN}" \
  --root "${ROOT_DIR}" \
  --runtime "${RUNTIME}" \
  --php-version "${PHP_VERSION}" \
  --port "${APP_PORT}"

case "${DB_TYPE}" in
  mysql|mariadb|postgres|postgresql)
    DB_NAME="${USERNAME}_db"
    DB_USER="${USERNAME}_dbu"
    "${SCRIPT_DIR}/database-create.sh" \
      --domain "${DOMAIN}" \
      --type "${DB_TYPE}" \
      --database "${DB_NAME}" \
      --user "${DB_USER}" \
      --password "${PASSWORD}" || true
    ;;
  none|"") ;;
  *) fail "Database tidak didukung: ${DB_TYPE}" ;;
esac

if [ "${FTP_ENABLED}" = "yes" ]; then
  "${SCRIPT_DIR}/ftp-create.sh" --domain "${DOMAIN}" --user "${USERNAME}" --password "${PASSWORD}" --path "${ROOT_DIR}" || true
fi

if [ "${SSL_ENABLED}" = "yes" ]; then
  "${SCRIPT_DIR}/ssl-issue.sh" --domain "${DOMAIN}" --email "admin@${DOMAIN}" || true
elif [ "${SSL_ENABLED}" = "self" ]; then
  "${SCRIPT_DIR}/ssl-self.sh" --domain "${DOMAIN}" || true
fi

write_site_metadata "${DOMAIN}" "${USERNAME}" "${ROOT_DIR}" "${RUNTIME}" "${PHP_VERSION}" "${NODE_VERSION}" "${APP_PORT}" "${DB_TYPE}" "${SSL_ENABLED}" "${FTP_ENABLED}" "running"

# === Verifikasi dan auto-fixing ===
log "Memverifikasi website..."

# 1. Pastikan framework punya .env
if [ "${CLONE_SOURCE}" = "yes" ]; then
  case "${RUNTIME}" in
    ci4)
      if [ ! -f "${ROOT_DIR}/.env" ] && [ -f "${ROOT_DIR}/env" ]; then
        cp "${ROOT_DIR}/env" "${ROOT_DIR}/.env"
        chown "${USERNAME}:${USERNAME}" "${ROOT_DIR}/.env"
        log "Auto-fix: .env dibuat dari template"
      fi
      # Update dependensi biar kompatibel dengan PHP versi terbaru
      su - "${USERNAME}" -c "cd '${ROOT_DIR}' && composer update --no-interaction --no-dev 2>&1" || true
      # PHP 8.4+ bug: OPcache kadang salah resolve internal function
      # (misal: array_map jadi str_rot13). Matikan OPcache untuk CI4 di PHP 8.4+
      PHP_MAJOR="$(echo ${PHP_VERSION} | cut -d. -f1)"
      PHP_MINOR="$(echo ${PHP_VERSION} | cut -d. -f2)"
      if [ "${PHP_MAJOR}" -gt 8 ] || { [ "${PHP_MAJOR}" = "8" ] && [ "${PHP_MINOR}" -ge 4 ]; }; then
        POOL_CONF="${MYCP_PHP_CONFIG_DIR}/${PHP_VERSION}/fpm/pool.d/mycp-${DOMAIN}.conf"
        if [ -f "${POOL_CONF}" ] && ! grep -q 'opcache.enable' "${POOL_CONF}"; then
          echo "php_admin_flag[opcache.enable] = off" >> "${POOL_CONF}"
          systemctl reload "php${PHP_VERSION}-fpm" 2>/dev/null || true
          log "Auto-fix: OPcache disabled untuk PHP 8.4+ bug (CI4)"
        fi
      fi
      ;;
    laravel)
      if [ -f "${ROOT_DIR}/.env" ]; then
        # Pastikan storage writable
        chmod -R 775 "${ROOT_DIR}/storage" "${ROOT_DIR}/bootstrap/cache" 2>/dev/null || true
        chown -R "${USERNAME}:www-data" "${ROOT_DIR}/storage" "${ROOT_DIR}/bootstrap/cache" 2>/dev/null || true
      fi ;;
  esac
fi

# 2. Verifikasi FPM socket
POOL_SOCKET="${MYCP_SOCK_DIR}/mycp-${DOMAIN}.sock"
if [ ! -S "${POOL_SOCKET}" ]; then
  log "WARNING: FPM socket ${POOL_SOCKET} belum ada, reload FPM..."
  FPM_MASTER_PID="$(systemctl show -p MainPID "php${PHP_VERSION}-fpm" 2>/dev/null | sed 's/MainPID=//')"
  if [ -z "${FPM_MASTER_PID}" ] || [ "${FPM_MASTER_PID}" = "0" ]; then
    FPM_MASTER_PID="$(ps aux | grep "php-fpm: master.*${MYCP_PHP_CONFIG_DIR}/${PHP_VERSION}/fpm/" | grep -v grep | awk '{print $2}' | head -1)"
  fi
  if [ -n "${FPM_MASTER_PID}" ] && [ "${FPM_MASTER_PID}" != "0" ]; then
    kill -USR2 "${FPM_MASTER_PID}" 2>/dev/null || true
    sleep 2
  fi
  if [ ! -S "${POOL_SOCKET}" ]; then
    rm -f "${POOL_SOCKET}" "${MYCP_PHP_SOCK_DIR}/php${PHP_VERSION}-fpm.sock" 2>/dev/null || true
    systemctl restart "php${PHP_VERSION}-fpm" 2>/dev/null || true
    sleep 2
  fi
fi

# 3. Verifikasi nginx socket
VHOST_FILE="${MYCP_NGINX_DIR}/sites-enabled/${MYCP_NGINX_PREFIX}${DOMAIN}"
if [ -f "${VHOST_FILE}" ]; then
  CURRENT_SOCKET="$(grep 'fastcgi_pass' "${VHOST_FILE}" 2>/dev/null | grep -oP 'unix:\K[^;]+' 2>/dev/null || true)"
  if [ -n "${CURRENT_SOCKET}" ] && [ "${CURRENT_SOCKET}" != "${POOL_SOCKET}" ] && [ -S "${POOL_SOCKET}" ]; then
    sed -i "s|fastcgi_pass unix:${CURRENT_SOCKET};|fastcgi_pass unix:${POOL_SOCKET};|" "${VHOST_FILE}" 2>/dev/null || true
    nginx -t 2>/dev/null && systemctl reload nginx 2>/dev/null || true
    log "Auto-fix: nginx socket diperbaiki ke ${POOL_SOCKET}"
  fi
fi

# 4. Test HTTP response (max 3 kali percobaan)
for attempt in 1 2 3; do
  HTTP_CODE="$(curl -s -o /dev/null -w '%{http_code}' -H "Host: ${DOMAIN}" http://127.0.0.1 2>/dev/null || echo '000')"
  if [ "${HTTP_CODE}" = "200" ] || [ "${HTTP_CODE}" = "301" ] || [ "${HTTP_CODE}" = "302" ]; then
    log "Website ${DOMAIN} berfungsi (HTTP ${HTTP_CODE})"
    break
  fi
  if [ "${attempt}" -lt 3 ]; then
    log "HTTP ${HTTP_CODE}, mencoba lagi dalam 3 detik..."
    sleep 3
  fi
done

log "Website dibuat: ${DOMAIN}"
