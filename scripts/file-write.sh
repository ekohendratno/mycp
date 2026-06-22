#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

DOMAIN=""
REL_PATH=""
CONTENT_FILE=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --path) REL_PATH="${2:-}"; shift 2 ;;
    --content-file) CONTENT_FILE="${2:-}"; shift 2 ;;
    *) fail "Argumen tidak dikenal: $1" ;;
  esac
done

require_root
load_site "${DOMAIN}"
[ -n "${REL_PATH}" ] || fail "--path wajib diisi"
[[ "${REL_PATH}" != /* && "${REL_PATH}" != *".."* ]] || fail "Path file tidak aman"
[ -f "${CONTENT_FILE}" ] || fail "Content file tidak ditemukan"

TARGET="${ROOT_DIR}/${REL_PATH}"
mkdir -p "$(dirname "${TARGET}")"
cp "${CONTENT_FILE}" "${TARGET}"
chown "${USERNAME}:${USERNAME}" "${TARGET}"
chmod 644 "${TARGET}"
log "File tersimpan: ${TARGET}"
