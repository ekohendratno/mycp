#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"

DB_TYPE="mysql"
DB_NAME=""
DB_USER=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --type) DB_TYPE="${2:-}"; shift 2 ;;
    --database) DB_NAME="${2:-}"; shift 2 ;;
    --user) DB_USER="${2:-}"; shift 2 ;;
    *) fail "Argumen tidak dikenal: $1" ;;
  esac
done

[ -n "${DB_NAME}" ] || fail "--database wajib diisi"
# fallback jika --user tidak dikirim: gunakan DB_NAME sebagai user
if [ -z "$DB_USER" ]; then
  DB_USER="$DB_NAME"
fi

case "${DB_TYPE}" in
  mysql|mariadb)
    need_cmd mysql
    mysql -e "DROP DATABASE IF EXISTS \`${DB_NAME}\`;"
    mysql -e "DROP USER IF EXISTS '${DB_USER}'@'localhost';"
    ;;
  postgres|postgresql)
    need_cmd psql
    sudo -u postgres psql -c "DROP DATABASE IF EXISTS \"${DB_NAME}\";"
    sudo -u postgres psql -c "DROP ROLE IF EXISTS \"${DB_USER}\";"
    ;;
  *) fail "Database type tidak didukung: ${DB_TYPE}" ;;
esac

log "Database dihapus: ${DB_NAME} (${DB_TYPE})"
