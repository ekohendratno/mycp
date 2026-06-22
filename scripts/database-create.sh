#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

DOMAIN=""
DB_TYPE="mysql"
DB_NAME=""
DB_USER=""
DB_PASSWORD=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --type) DB_TYPE="${2:-}"; shift 2 ;;
    --database) DB_NAME="${2:-}"; shift 2 ;;
    --user) DB_USER="${2:-}"; shift 2 ;;
    --password) DB_PASSWORD="${2:-}"; shift 2 ;;
    *) fail "Argumen tidak dikenal: $1" ;;
  esac
done

require_root
require_domain "${DOMAIN}"
[[ "${DB_NAME}" =~ ^[a-zA-Z0-9_]{2,64}$ ]] || fail "Nama database tidak valid"
[[ "${DB_USER}" =~ ^[a-zA-Z0-9_]{2,64}$ ]] || fail "User database tidak valid"
[ -n "${DB_PASSWORD}" ] || fail "--password wajib diisi"
SQL_PASSWORD="${DB_PASSWORD//\'/\'\'}"

case "${DB_TYPE}" in
  mysql|mariadb)
    need_cmd mysql
    mysql <<SQL
CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${SQL_PASSWORD}';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'localhost';
FLUSH PRIVILEGES;
SQL
    ;;
  postgres|postgresql)
    need_cmd psql
    sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1 || sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${SQL_PASSWORD}';"
    sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1 || sudo -u postgres createdb -O "${DB_USER}" "${DB_NAME}"
    ;;
  *) fail "Database type tidak didukung: ${DB_TYPE}" ;;
esac

log "Database dibuat: ${DB_NAME} (${DB_TYPE})"
