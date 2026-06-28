#!/usr/bin/env bash

MYCP_ETC_DIR="${MYCP_ETC_DIR:-/etc/mycontrolpanel}"
MYCP_SITES_DIR="${MYCP_SITES_DIR:-${MYCP_ETC_DIR}/sites}"
MYCP_NGINX_PREFIX="${MYCP_NGINX_PREFIX:-mycp-}"

# Configurable paths (can be overridden via env vars)
MYCP_HOME_PREFIX="${MYCP_HOME_PREFIX:-/home}"
# APP_DIR dideteksi otomatis dari lokasi scripts dir jika tidak di-set
if [ -z "${MYCP_APP_DIR:-}" ]; then
  detected="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." 2>/dev/null && pwd || echo "/opt/mycontrolpanel")"
  if [ -f "${detected}/server/server.js" ]; then
    MYCP_APP_DIR="${detected}"
  else
    MYCP_APP_DIR="/opt/mycontrolpanel"
  fi
fi
MYCP_SCRIPTS_DIR="${MYCP_SCRIPTS_DIR:-${MYCP_APP_DIR}/scripts}"
MYCP_SOCK_DIR="${MYCP_SOCK_DIR:-/run/php-fpm}"
MYCP_PHP_SOCK_DIR="${MYCP_PHP_SOCK_DIR:-/run/php}"
MYCP_LOG_DIR="${MYCP_LOG_DIR:-/var/log/nginx}"
MYCP_NGINX_DIR="${MYCP_NGINX_DIR:-/etc/nginx}"
MYCP_PHP_CONFIG_DIR="${MYCP_PHP_CONFIG_DIR:-/etc/php}"
MYCP_SSL_DIR="${MYCP_SSL_DIR:-${MYCP_NGINX_DIR}/ssl}"
MYCP_MYSQL_SOCK="${MYCP_MYSQL_SOCK:-/run/mysqld/mysqld.sock}"
MYCP_MYSQL_PID="${MYCP_MYSQL_PID:-/run/mysqld/mysqld.pid}"
MYCP_MYSQL_RUN_DIR="${MYCP_MYSQL_RUN_DIR:-/run/mysqld}"
MYCP_NGINX_PID="${MYCP_NGINX_PID:-/run/nginx.pid}"
MYCP_VSFTPD_PID="${MYCP_VSFTPD_PID:-/run/vsftpd/vsftpd.pid}"
MYCP_PHP_FPM_LOG_DIR="${MYCP_PHP_FPM_LOG_DIR:-/var/log/php-fpm}"
MYCP_UPLOAD_DIR="${MYCP_UPLOAD_DIR:-/tmp/mycp-uploads}"
MYCP_PMA_CONFIG_DIR="${MYCP_PMA_CONFIG_DIR:-/etc/phpmyadmin}"
MYCP_PMA_PORT="${MYCP_PMA_PORT:-8087}"
MYCP_PMA_ROOT="${MYCP_PMA_ROOT:-/usr/share/phpmyadmin}"

log() {
  printf '[mycp] %s\n' "$*"
}

warn() {
  printf '[mycp] WARN: %s\n' "$*" >&2
}

fail() {
  printf '[mycp] ERROR: %s\n' "$*" >&2
  exit 1
}

require_root() {
  [ "${EUID}" -eq 0 ] || fail "Jalankan sebagai root/sudo."
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Command tidak tersedia: $1"
}

ensure_state_dirs() {
  mkdir -p "${MYCP_SITES_DIR}"
  chmod 755 "${MYCP_ETC_DIR}" "${MYCP_SITES_DIR}"
}

valid_domain() {
  [[ "${1:-}" =~ ^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$ ]]
}

valid_user() {
  [[ "${1:-}" =~ ^[a-z_][a-z0-9_-]{1,30}$ ]]
}

valid_path() {
  local prefix="${MYCP_HOME_PREFIX}"
  [[ "${1:-}" =~ ^${prefix}/[a-z_][a-z0-9_-]*/htdocs(/.*)?$ ]]
}

require_domain() {
  valid_domain "$1" || fail "Domain tidak valid: ${1:-}"
}

require_user() {
  valid_user "$1" || fail "Username tidak valid: ${1:-}"
}

require_path() {
  valid_path "$1" || fail "Path harus berada di ${MYCP_HOME_PREFIX}/USER/htdocs: ${1:-}"
}

site_file() {
  local domain="$1"
  printf '%s/%s.env\n' "${MYCP_SITES_DIR}" "${domain}"
}

load_site() {
  local domain="$1"
  local file
  require_domain "${domain}"
  file="$(site_file "${domain}")"
  [ -f "${file}" ] || fail "Site belum terdaftar: ${domain}"
  # shellcheck disable=SC1090
  source "${file}"
}

save_site() {
  local domain="$1"
  local file
  require_domain "${domain}"
  ensure_state_dirs
  file="$(site_file "${domain}")"
  umask 022
  cat >"${file}"
}

restart_service() {
  local service_name="$1"
  if command -v systemctl >/dev/null 2>&1 && systemctl list-units >/dev/null 2>&1; then
    systemctl restart "${service_name}"
  else
    service "${service_name}" restart
  fi
}

service_restart() {
  local service_name="$1"
  if command -v systemctl >/dev/null 2>&1 && systemctl list-units >/dev/null 2>&1; then
    systemctl restart "${service_name}" 2>/dev/null || true
  else
    service "${service_name}" restart 2>/dev/null || true
  fi
}

reload_nginx() {
  nginx -t
  if command -v systemctl >/dev/null 2>&1 && systemctl list-units >/dev/null 2>&1; then
    systemctl reload nginx || systemctl restart nginx
  else
    service nginx reload || service nginx restart
  fi
}

php_fpm_socket() {
  local version="${1:-8.3}"
  local normalized="${version#PHP }"
  normalized="${normalized%% *}"
  local sock="${MYCP_PHP_SOCK_DIR}/php${normalized}-fpm.sock"
  if [ -S "${sock}" ]; then
    printf '%s\n' "${sock}"
    return
  fi
  local first_socket
  first_socket="$(find "${MYCP_PHP_SOCK_DIR}" -maxdepth 1 -name 'php*-fpm.sock' 2>/dev/null | head -n 1 || true)"
  [ -n "${first_socket}" ] && printf '%s\n' "${first_socket}" || printf '%s/php-fpm.sock\n' "${MYCP_PHP_SOCK_DIR}"
}

write_site_metadata() {
  local domain="$1"
  local username="$2"
  local root_dir="$3"
  local runtime="$4"
  local php_version="$5"
  local node_version="$6"
  local app_port="$7"
  local db_type="$8"
  local ssl_enabled="$9"
  local ftp_enabled="${10}"
  local status="${11:-running}"

  save_site "${domain}" <<EOF_SITE
DOMAIN="${domain}"
USERNAME="${username}"
ROOT_DIR="${root_dir}"
RUNTIME="${runtime}"
PHP_VERSION="${php_version}"
NODE_VERSION="${node_version}"
APP_PORT="${app_port}"
DB_TYPE="${db_type}"
SSL_ENABLED="${ssl_enabled}"
FTP_ENABLED="${ftp_enabled}"
STATUS="${status}"
EOF_SITE
}
