#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

DOMAIN=""
RUN_USER=""
SCHEDULE=""
COMMAND=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --user) RUN_USER="${2:-}"; shift 2 ;;
    --schedule) SCHEDULE="${2:-}"; shift 2 ;;
    --command) COMMAND="${2:-}"; shift 2 ;;
    *) fail "Argumen tidak dikenal: $1" ;;
  esac
done

require_root
load_site "${DOMAIN}"
[ -n "${RUN_USER}" ] || RUN_USER="${USERNAME}"
require_user "${RUN_USER}"
[ -n "${SCHEDULE}" ] || fail "--schedule wajib diisi"
[ -n "${COMMAND}" ] || fail "--command wajib diisi"

CRON_FILE="/etc/cron.d/mycp-${DOMAIN}"
touch "${CRON_FILE}"
grep -vF " # mycp:${DOMAIN}:${COMMAND}" "${CRON_FILE}" >"${CRON_FILE}.tmp" || true
mv "${CRON_FILE}.tmp" "${CRON_FILE}"
printf '%s %s cd %s && %s # mycp:%s:%s\n' "${SCHEDULE}" "${RUN_USER}" "${ROOT_DIR}" "${COMMAND}" "${DOMAIN}" "${COMMAND}" >>"${CRON_FILE}"
chmod 644 "${CRON_FILE}"
log "Cron ditambahkan: ${DOMAIN}"
