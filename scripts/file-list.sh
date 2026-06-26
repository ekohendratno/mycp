#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

DOMAIN=""
REL_PATH="."

while [ "$#" -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --path) REL_PATH="${2:-.}"; shift 2 ;;
    *) fail "Argumen tidak dikenal: $1" ;;
  esac
done

load_site "${DOMAIN}"
[[ "${REL_PATH}" != /* && "${REL_PATH}" != *".."* ]] || fail "Path tidak aman"

TARGET="${ROOT_DIR}/${REL_PATH}"
[ -d "${TARGET}" ] || fail "Folder tidak ditemukan: ${REL_PATH}"

printf 'type\tname\tsize\tmodified\towner\tperms\n'
find "${TARGET}" -maxdepth 1 -mindepth 1 -printf '%y\t%f\t%s\t%TY-%Tm-%Td %TH:%TM\t%u\t%m\n' | sort
