#!/usr/bin/env bash
set -Eeuo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"
DOMAIN=""; SRC_PATH=""; DEST_PATH=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --source) SRC_PATH="${2:-}"; shift 2 ;;
    --dest) DEST_PATH="${2:-}"; shift 2 ;;
    *) fail "Argumen tidak dikenal: $1" ;;
  esac
done
load_site "${DOMAIN}"
[[ "${SRC_PATH}" != *".."* ]] || fail "Path tidak aman"
[[ "${DEST_PATH}" != *".."* ]] || fail "Path tujuan tidak aman"
SRC="${ROOT_DIR}/${SRC_PATH}"
DEST="${ROOT_DIR}/${DEST_PATH}"
[ -e "${SRC}" ] || fail "File/folder tidak ditemukan: ${SRC_PATH}"
if [ -d "${SRC}" ]; then
  cp -a "${SRC}" "${DEST}"
else
  cp "${SRC}" "${DEST}"
fi
log "Copied: ${SRC_PATH} -> ${DEST_PATH}"
