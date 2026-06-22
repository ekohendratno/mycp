#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

DOMAIN=""
NEW_RUNTIME=""
NEW_PHP_VERSION=""
NEW_NODE_VERSION=""
NEW_PORT=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --runtime) NEW_RUNTIME="${2:-}"; shift 2 ;;
    --php-version) NEW_PHP_VERSION="${2:-}"; shift 2 ;;
    --node-version) NEW_NODE_VERSION="${2:-}"; shift 2 ;;
    --port) NEW_PORT="${2:-}"; shift 2 ;;
    *) fail "Argumen tidak dikenal: $1" ;;
  esac
done

require_root
load_site "${DOMAIN}"

[ -n "${NEW_RUNTIME}" ] && RUNTIME="${NEW_RUNTIME}"
[ -n "${NEW_PHP_VERSION}" ] && PHP_VERSION="${NEW_PHP_VERSION}"
[ -n "${NEW_NODE_VERSION}" ] && NODE_VERSION="${NEW_NODE_VERSION}"
[ -n "${NEW_PORT}" ] && APP_PORT="${NEW_PORT}"

"${SCRIPT_DIR}/vhost-save.sh" --domain "${DOMAIN}" --root "${ROOT_DIR}" --runtime "${RUNTIME}" --php-version "${PHP_VERSION}" --port "${APP_PORT}"
write_site_metadata "${DOMAIN}" "${USERNAME}" "${ROOT_DIR}" "${RUNTIME}" "${PHP_VERSION}" "${NODE_VERSION}" "${APP_PORT}" "${DB_TYPE}" "${SSL_ENABLED}" "${FTP_ENABLED}" "${STATUS:-running}"
log "Runtime tersimpan: ${DOMAIN}"
