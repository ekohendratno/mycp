#!/usr/bin/env bash
set -Eeuo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"
DOMAIN=""; REL_PATH=""; MODE=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --path) REL_PATH="${2:-}"; shift 2 ;;
    --mode) MODE="${2:-}"; shift 2 ;;
    *) fail "Argumen tidak dikenal: $1" ;;
  esac
done
load_site "${DOMAIN}"
[[ "${REL_PATH}" != *".."* ]] || fail "Path tidak aman"
[[ "${MODE}" =~ ^[0-7]{3,4}$ ]] || fail "Mode tidak valid (gunakan 3-4 digit octal): ${MODE}"
TARGET="${ROOT_DIR}/${REL_PATH}"
[ -e "${TARGET}" ] || fail "File/folder tidak ditemukan: ${REL_PATH}"
chmod "${MODE}" "${TARGET}"
log "Permissions changed: ${REL_PATH} -> ${MODE}"
