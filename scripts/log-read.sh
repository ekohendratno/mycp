#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

DOMAIN=""
TYPE="access"
LINES="100"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --type) TYPE="${2:-access}"; shift 2 ;;
    --lines) LINES="${2:-100}"; shift 2 ;;
    *) fail "Argumen tidak dikenal: $1" ;;
  esac
done

require_domain "${DOMAIN}"
[[ "${LINES}" =~ ^[0-9]+$ ]] || fail "--lines harus angka"

case "${TYPE}" in
  access) LOG_FILE="${MYCP_LOG_DIR}/${DOMAIN}.access.log" ;;
  error) LOG_FILE="${MYCP_LOG_DIR}/${DOMAIN}.error.log" ;;
  *) fail "Type log tidak didukung: ${TYPE}" ;;
esac

[ -f "${LOG_FILE}" ] || fail "Log belum ada: ${LOG_FILE}"
tail -n "${LINES}" "${LOG_FILE}"
