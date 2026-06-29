#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

DOMAIN=""
DELETE_USER="no"
DELETE_HOME="no"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --delete-user) DELETE_USER="${2:-yes}"; shift 2 ;;
    --delete-home) DELETE_HOME="${2:-yes}"; shift 2 ;;
    *) fail "Argumen tidak dikenal: $1" ;;
  esac
done

require_root
load_site "${DOMAIN}"

rm -f "${MYCP_NGINX_DIR}/sites-enabled/${MYCP_NGINX_PREFIX}${DOMAIN}" "${MYCP_NGINX_DIR}/sites-available/${MYCP_NGINX_PREFIX}${DOMAIN}"
rm -f "$(site_file "${DOMAIN}")"
rm -f "${MYCP_PHP_CONFIG_DIR}"/*/fpm/pool.d/mycp-${DOMAIN}.conf
rm -f "${MYCP_SOCK_DIR}/mycp-${DOMAIN}.sock"

# Reload PHP-FPM
if command -v systemctl >/dev/null 2>&1; then
  for fpm in php*-fpm; do
    systemctl reload "${fpm}" 2>/dev/null || true
  done
else
  pkill -USR2 php-fpm 2>/dev/null || true
fi
reload_nginx

# Hapus database MySQL/PostgreSQL jika ada
if [ -n "${DB_TYPE:-}" ] && [ "${DB_TYPE}" != "none" ]; then
  DB_NAME="${USERNAME}_db"
  DB_USER="${USERNAME}_dbu"
  bash "${SCRIPT_DIR}/database-drop.sh" --type "${DB_TYPE}" --database "${DB_NAME}" --user "${DB_USER}" || true
fi

# Hentikan dan hapus PM2 process (sebelum user dihapus)
if command -v pm2 >/dev/null 2>&1; then
  su - "${USERNAME:-root}" -c "pm2 stop '${DOMAIN}' --silent 2>&1" 2>/dev/null || true
  su - "${USERNAME:-root}" -c "pm2 delete '${DOMAIN}' --silent 2>&1" 2>/dev/null || true
  su - "${USERNAME:-root}" -c "pm2 save --silent 2>&1" 2>/dev/null || true
fi

# Hapus cron jobs
rm -f "/etc/cron.d/mycp-${DOMAIN}"

# Hapus SSL certificate
CERT_DIR="${MYCP_SSL_DIR}/${DOMAIN}"
if [ -d "${CERT_DIR}" ]; then
  rm -rf "${CERT_DIR}"
fi
# Hapus Let's Encrypt certificate (jika ada)
if command -v certbot >/dev/null 2>&1; then
  certbot delete --cert-name "${DOMAIN}" --non-interactive 2>/dev/null || true
fi

# Hapus log files
rm -f "${MYCP_LOG_DIR}/${DOMAIN}.access.log" "${MYCP_LOG_DIR}/${DOMAIN}.error.log"
rm -f "${MYCP_PHP_FPM_LOG_DIR}/${DOMAIN}.error.log"

# Hapus home directory (dengan safety check)
HOME_DIR="${MYCP_HOME_PREFIX}/${USERNAME}"
if [ "${DELETE_HOME}" = "yes" ] && [ -n "${USERNAME:-}" ] && [[ "${HOME_DIR}" == "${MYCP_HOME_PREFIX}/"*[a-z] ]] && [ -d "${HOME_DIR}" ]; then
  rm -rf "${HOME_DIR}"
fi

# Hapus system user (juga menghapus akses FTP)
if [ "${DELETE_USER}" = "yes" ] && id "${USERNAME}" >/dev/null 2>&1; then
  userdel "${USERNAME}" 2>/dev/null || true
  restart_service vsftpd 2>/dev/null || true
fi

log "Website dihapus: ${DOMAIN}"
