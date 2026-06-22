#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

DOMAIN=""
NEW_DOMAIN=""
NEW_ROOT_DIR=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --new-domain) NEW_DOMAIN="${2:-}"; shift 2 ;;
    --root) NEW_ROOT_DIR="${2:-}"; shift 2 ;;
    *) fail "Argumen tidak dikenal: $1" ;;
  esac
done

require_root
load_site "${DOMAIN}"
[ -n "${NEW_DOMAIN}" ] || NEW_DOMAIN="${DOMAIN}"
[ -n "${NEW_ROOT_DIR}" ] && ROOT_DIR="${NEW_ROOT_DIR}"
require_domain "${NEW_DOMAIN}"
require_path "${ROOT_DIR}"

if [ "${NEW_DOMAIN}" != "${DOMAIN}" ]; then
  rm -f "/etc/nginx/sites-enabled/${MYCP_NGINX_PREFIX}${DOMAIN}" "/etc/nginx/sites-available/${MYCP_NGINX_PREFIX}${DOMAIN}"
  rm -f "$(site_file "${DOMAIN}")"
fi

"${SCRIPT_DIR}/vhost-save.sh" --domain "${NEW_DOMAIN}" --root "${ROOT_DIR}" --runtime "${RUNTIME}" --php-version "${PHP_VERSION}" --port "${APP_PORT}"
write_site_metadata "${NEW_DOMAIN}" "${USERNAME}" "${ROOT_DIR}" "${RUNTIME}" "${PHP_VERSION}" "${NODE_VERSION}" "${APP_PORT}" "${DB_TYPE}" "${SSL_ENABLED}" "${FTP_ENABLED}" "${STATUS:-running}"
log "Domain settings tersimpan: ${NEW_DOMAIN}"
