#!/usr/bin/env bash

MYCP_ETC_DIR="${MYCP_ETC_DIR:-/etc/mycontrolpanel}"
MYCP_SITES_DIR="${MYCP_SITES_DIR:-${MYCP_ETC_DIR}/sites}"
MYCP_NGINX_PREFIX="${MYCP_NGINX_PREFIX:-mycp-}"

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
  [[ "${1:-}" =~ ^/home/[a-z_][a-z0-9_-]*/htdocs(/.*)?$ ]]
}

require_domain() {
  valid_domain "$1" || fail "Domain tidak valid: ${1:-}"
}

require_user() {
  valid_user "$1" || fail "Username tidak valid: ${1:-}"
}

require_path() {
  valid_path "$1" || fail "Path harus berada di /home/USER/htdocs: ${1:-}"
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
  if [ -S "/run/php/php${normalized}-fpm.sock" ]; then
    printf '/run/php/php%s-fpm.sock\n' "${normalized}"
    return
  fi
  local first_socket
  first_socket="$(find /run/php -maxdepth 1 -name 'php*-fpm.sock' 2>/dev/null | head -n 1 || true)"
  [ -n "${first_socket}" ] && printf '%s\n' "${first_socket}" || printf '/run/php/php-fpm.sock\n'
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
