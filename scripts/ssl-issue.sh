#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

DOMAIN=""
EMAIL=""
STAGING="no"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --email) EMAIL="${2:-}"; shift 2 ;;
    --staging) STAGING="${2:-yes}"; shift 2 ;;
    *) fail "Argumen tidak dikenal: $1" ;;
  esac
done

require_root
need_cmd certbot
require_domain "${DOMAIN}"
[ -n "${EMAIL}" ] || EMAIL="admin@${DOMAIN}"

ARGS=(--nginx -d "${DOMAIN}" -d "www.${DOMAIN}" --non-interactive --agree-tos --email "${EMAIL}" --redirect)
[ "${STAGING}" = "yes" ] && ARGS+=(--staging)

certbot "${ARGS[@]}"
log "SSL diproses untuk ${DOMAIN}"
