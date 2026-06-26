#!/usr/bin/env bash
set -Eeuo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"
require_root
need_cmd mysql

# Revoke SHOW DATABASES from all per-site users (exclude root, debian-sys-maint, phpmyadmin, mysql.*)
users=$(mysql -N -e "SELECT user FROM mysql.user WHERE user NOT IN ('root','debian-sys-maint','phpmyadmin','mariadb.sys','mysql') AND host='localhost';" 2>/dev/null || true)
if [ -n "${users}" ]; then
  while IFS= read -r user; do
    [ -n "${user}" ] || continue
    log "Revoke SHOW DATABASES from ${user}@localhost"
    mysql -e "REVOKE SHOW DATABASES ON *.* FROM '${user}'@'localhost';" 2>/dev/null || true
  done <<< "${users}"
fi
mysql -e "FLUSH PRIVILEGES;" 2>/dev/null || true
log "Done fixing database privileges"
