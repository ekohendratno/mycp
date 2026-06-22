#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

DOMAIN=""
FTP_USER=""
FTP_PASSWORD=""
FTP_PATH=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --user) FTP_USER="${2:-}"; shift 2 ;;
    --password) FTP_PASSWORD="${2:-}"; shift 2 ;;
    --path) FTP_PATH="${2:-}"; shift 2 ;;
    *) fail "Argumen tidak dikenal: $1" ;;
  esac
done

require_root
require_domain "${DOMAIN}"
require_user "${FTP_USER}"
require_path "${FTP_PATH}"
[ -n "${FTP_PASSWORD}" ] || fail "--password wajib diisi"

if id "${FTP_USER}" >/dev/null 2>&1; then
  log "FTP user ${FTP_USER} sudah ada"
else
  useradd -M -d "${FTP_PATH}" -s /usr/sbin/nologin "${FTP_USER}"
fi

echo "${FTP_USER}:${FTP_PASSWORD}" | chpasswd
usermod -d "${FTP_PATH}" "${FTP_USER}"
chown -R "${FTP_USER}:www-data" "${FTP_PATH}" || true
chmod 755 "${FTP_PATH}"
restart_service vsftpd || true
log "FTP account siap: ${FTP_USER}"
