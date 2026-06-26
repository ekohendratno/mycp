#!/usr/bin/env bash
set -Eeuo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"
DOMAIN=""; OLD_PATH=""; NEW_NAME=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --old-path) OLD_PATH="${2:-}"; shift 2 ;;
    --new-name) NEW_NAME="${2:-}"; shift 2 ;;
    *) fail "Argumen tidak dikenal: $1" ;;
  esac
done
load_site "${DOMAIN}"
[[ "${OLD_PATH}" != *".."* ]] || fail "Path tidak aman"
[[ "${NEW_NAME}" != *"/"* ]] || fail "Nama tidak valid"
TARGET="${ROOT_DIR}/${OLD_PATH}"
[ -e "${TARGET}" ] || fail "File/folder tidak ditemukan: ${OLD_PATH}"
DIR=$(dirname "${TARGET}")
mv "${TARGET}" "${DIR}/${NEW_NAME}"
log "Renamed: ${OLD_PATH} -> ${NEW_NAME}"
