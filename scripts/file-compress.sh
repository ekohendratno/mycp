#!/usr/bin/env bash
set -Eeuo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"
DOMAIN=""; REL_PATH=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --path) REL_PATH="${2:-}"; shift 2 ;;
    *) fail "Argumen tidak dikenal: $1" ;;
  esac
done
load_site "${DOMAIN}"
[[ "${REL_PATH}" != *".."* ]] || fail "Path tidak aman"
TARGET="${ROOT_DIR}/${REL_PATH}"
[ -e "${TARGET}" ] || fail "File/folder tidak ditemukan: ${REL_PATH}"
BASENAME=$(basename "${TARGET}")
DIRNAME=$(dirname "${TARGET}")
ZIP_NAME="${BASENAME}.zip"
cd "${DIRNAME}"
[ -f "${ZIP_NAME}" ] && rm -f "${ZIP_NAME}"
zip -r "${ZIP_NAME}" "${BASENAME}" >/dev/null
log "Compressed: ${REL_PATH} -> ${REL_PATH}.zip"
