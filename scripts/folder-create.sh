#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

DOMAIN=""
REL_PATH=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --path) REL_PATH="${2:-}"; shift 2 ;;
    *) fail "Argumen tidak dikenal: $1" ;;
  esac
done

require_root
load_site "${DOMAIN}"
[ -n "${REL_PATH}" ] || fail "--path wajib diisi"
[[ "${REL_PATH}" != /* && "${REL_PATH}" != *".."* ]] || fail "Path folder tidak aman"

TARGET="${ROOT_DIR}/${REL_PATH}"
mkdir -p "${TARGET}"
chown -R "${USERNAME}:${USERNAME}" "${TARGET}"
chmod 755 "${TARGET}"
log "Folder dibuat: ${TARGET}"
