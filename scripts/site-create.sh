#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

DOMAIN=""
USERNAME=""
PASSWORD=""
RUNTIME="php"
PHP_VERSION="8.3"
NODE_VERSION="20"
DB_TYPE="none"
APP_PORT="80"
SSL_ENABLED="no"
FTP_ENABLED="yes"
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
[ -n "${ROOT_DIR}" ] || ROOT_DIR="/home/${USERNAME}/htdocs"
require_path "${ROOT_DIR}"

if id "${USERNAME}" >/dev/null 2>&1; then
  log "User ${USERNAME} sudah ada"
else
  useradd -m -s /bin/bash "${USERNAME}"
fi

echo "${USERNAME}:${PASSWORD}" | chpasswd
usermod -aG www-data "${USERNAME}" || true
mkdir -p "${ROOT_DIR}"
chown -R "${USERNAME}:${USERNAME}" "/home/${USERNAME}"
chmod 755 "/home/${USERNAME}" "${ROOT_DIR}"

if [ ! -f "${ROOT_DIR}/index.html" ] && [ ! -f "${ROOT_DIR}/index.php" ]; then
  cat >"${ROOT_DIR}/index.html" <<HTML
<!doctype html>
<html>
<head><meta charset="utf-8"><title>${DOMAIN}</title></head>
<body><h1>${DOMAIN}</h1><p>Website berhasil dibuat oleh MyControlPanel.</p></body>
</html>
HTML
  chown "${USERNAME}:${USERNAME}" "${ROOT_DIR}/index.html"
fi

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
fi

write_site_metadata "${DOMAIN}" "${USERNAME}" "${ROOT_DIR}" "${RUNTIME}" "${PHP_VERSION}" "${NODE_VERSION}" "${APP_PORT}" "${DB_TYPE}" "${SSL_ENABLED}" "${FTP_ENABLED}" "running"
log "Website dibuat: ${DOMAIN}"
