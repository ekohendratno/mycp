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

rm -f "/etc/nginx/sites-enabled/${MYCP_NGINX_PREFIX}${DOMAIN}" "/etc/nginx/sites-available/${MYCP_NGINX_PREFIX}${DOMAIN}"
rm -f "$(site_file "${DOMAIN}")"
rm -f /etc/php/*/fpm/pool.d/mycp-${DOMAIN}.conf
reload_nginx

if [ "${DELETE_HOME}" = "yes" ] && [ -n "${ROOT_DIR:-}" ] && [[ "${ROOT_DIR}" == /home/*/htdocs* ]]; then
  rm -rf "${ROOT_DIR}"
fi

if [ "${DELETE_USER}" = "yes" ] && id "${USERNAME}" >/dev/null 2>&1; then
  userdel "${USERNAME}" || true
fi

log "Website dihapus: ${DOMAIN}"
