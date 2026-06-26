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
[ -f "${TARGET}" ] || fail "File tidak ditemukan: ${REL_PATH}"
cat "${TARGET}"
