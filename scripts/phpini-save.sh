#!/usr/bin/env bash
# phpini-save.sh - Kelola konfigurasi PHP-FPM pool untuk sebuah website
# Usage:
#   phpini-save.sh --domain <domain> --read-only
#   phpini-save.sh --domain <domain> --set memory_limit=512M --set max_execution_time=60
#   phpini-save.sh --domain <domain> --raw "memory_limit = 512M"
#
# Penyimpanan: /etc/php/<ver>/fpm/pool.d/mycp-<domain>.conf
# Pool name: mycp-<domain>  (listen: /run/php-fpm/mycp-<domain>.sock)

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

DOMAIN=""
READ_ONLY=""
PHP_VERSION=""
RAW=""
declare -a SETS=()

while [ "$#" -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --read-only) READ_ONLY="1"; shift ;;
    --user|--username) USERNAME="${2:-}"; shift 2 ;;
    --php-version) PHP_VERSION="${2:-}"; shift 2 ;;
    --raw) RAW="${2:-}"; shift 2 ;;
    --set)
      v="${2:-}"
      [[ "${v}" =~ ^[a-zA-Z_][a-zA-Z0-9_]*=[^[:space:]].*$ ]] || fail "Format --set salah: ${v} (contoh: memory_limit=512M)"
      SETS+=("${v}")
      shift 2
      ;;
    *) fail "Argumen tidak dikenal: $1" ;;
  esac
done

require_domain "${DOMAIN}"
require_root

# Tentukan versi PHP & username dari state site kalau tidak diberikan
SITE_ENV="${MYCP_SITES_DIR}/${DOMAIN}.env"
if [ -z "${PHP_VERSION}" ] || [ -z "${USERNAME:-}" ]; then
  if [ ! -f "${SITE_ENV}" ]; then
    fail "Site env tidak ditemukan: ${SITE_ENV} (wajib isi --php-version dan --user)"
  fi
  set +u
  # shellcheck disable=SC1090
  source "${SITE_ENV}"
  set -u
  USERNAME="${USERNAME:-}"
  PHP_VERSION="${PHP_VERSION:-8.3}"
fi
[ -n "${USERNAME:-}" ] || fail "Username tidak bisa ditentukan (cek .env atau pass --user)"
PHP_VERSION="${PHP_VERSION#PHP }"
PHP_VERSION="${PHP_VERSION%% *}"
PHP_VERSION="${PHP_VERSION% FPM}"

FPM_POOL_DIR="${MYCP_PHP_CONFIG_DIR}/${PHP_VERSION}/fpm/pool.d"
SOCK_DIR="${MYCP_SOCK_DIR}"
SOCK_PATH="${SOCK_DIR}/mycp-${DOMAIN}.sock"
FPM_USER="${USERNAME}"

# Fallback: jika versi PHP yang diminta belum terinstall, pakai versi terbaru yang tersedia
if [ ! -d "${FPM_POOL_DIR}" ]; then
  AVAILABLE_VER="$(ls -1 "${MYCP_PHP_CONFIG_DIR}" 2>/dev/null | sort -V | tail -n1)"
  if [ -n "${AVAILABLE_VER}" ] && [ -d "${MYCP_PHP_CONFIG_DIR}/${AVAILABLE_VER}/fpm/pool.d" ]; then
    warn "PHP ${PHP_VERSION} belum terinstall, fallback ke PHP ${AVAILABLE_VER}"
    PHP_VERSION="${AVAILABLE_VER}"
    FPM_POOL_DIR="${MYCP_PHP_CONFIG_DIR}/${PHP_VERSION}/fpm/pool.d"
  fi
fi

POOL_FILE="${FPM_POOL_DIR}/mycp-${DOMAIN}.conf"

# ----- mode read-only: cetak isi pool -----
if [ -n "${READ_ONLY}" ]; then
  if [ ! -f "${POOL_FILE}" ]; then
    printf '# pool belum dibuat\n'
    exit 0
  fi
  cat "${POOL_FILE}"
  exit 0
fi

# Bersihkan pool file lama di semua versi PHP untuk mencegah konflik socket
rm -f "${MYCP_PHP_CONFIG_DIR}"/*/fpm/pool.d/mycp-${DOMAIN}.conf 2>/dev/null || true

# Validasi PHP-FPM pool dir tersedia
if [ ! -d "${FPM_POOL_DIR}" ]; then
  fail "PHP-FPM pool directory tidak ditemukan: ${FPM_POOL_DIR} (cek --php-version)"
fi

# Pastikan user ada
if ! id "${FPM_USER}" >/dev/null 2>&1; then
  fail "User ${FPM_USER} tidak ada di sistem"
fi

mkdir -p "${SOCK_DIR}"
chmod 755 "${SOCK_DIR}"

umask 022
if [ -n "${RAW}" ]; then
  # Mode raw: tulis isi mentah persis seperti dikirim user, tanpa template
  printf '%s' "${RAW}" >"${POOL_FILE}"
else
  # Mode structured: template default + overrides SET
  {
    printf '[mycp-%s]\n' "${DOMAIN}"
    printf 'user = %s\n' "${FPM_USER}"
    printf 'group = %s\n' "${FPM_USER}"
    printf 'listen = %s\n' "${SOCK_PATH}"
    printf 'listen.owner = www-data\n'
    printf 'listen.group = www-data\n'
    printf 'pm = ondemand\n'
    printf 'pm.max_children = 8\n'
    printf 'pm.process_idle_timeout = 60s\n'
    printf 'pm.max_requests = 500\n'
    printf 'chdir = /\n'
    printf 'catch_workers_output = yes\n'

    # --- ISOLASI PER-SITE ---
    printf 'php_admin_value[open_basedir] = %s/%s/htdocs:%s/%s:%s:%s:%s\n' "${MYCP_HOME_PREFIX}" "${FPM_USER}" "${MYCP_HOME_PREFIX}" "${FPM_USER}" "/tmp" "${MYCP_PHP_FPM_LOG_DIR}" "${MYCP_SOCK_DIR}"
    printf 'php_admin_value[disable_functions] = exec,passthru,shell_exec,system,proc_open,popen,curl_multi_exec,parse_ini_file,show_source\n'
    printf 'php_admin_value[upload_tmp_dir] = %s/%s/tmp\n' "${MYCP_HOME_PREFIX}" "${FPM_USER}"
    printf 'php_admin_value[session.save_path] = %s/%s/tmp\n' "${MYCP_HOME_PREFIX}" "${FPM_USER}"
    printf 'php_admin_value[max_execution_time] = 60\n'
    printf 'php_admin_value[max_input_time] = 60\n'
    printf 'php_admin_value[memory_limit] = 256M\n'
    printf 'php_admin_flag[log_errors] = on\n'
    printf 'php_admin_flag[display_errors] = off\n'
    printf 'php_admin_value[error_log] = %s/%s.error.log\n' "${MYCP_PHP_FPM_LOG_DIR}" "${DOMAIN}"
    printf 'php_admin_flag[expose_php] = off\n'

    for kv in "${SETS[@]}"; do
      key="${kv%%=*}"
      val="${kv#*=}"
      printf 'php_admin_value[%s] = %s\n' "${key}" "${val}"
    done
  } >"${POOL_FILE}"
fi

chmod 644 "${POOL_FILE}"
chown root:root "${POOL_FILE}"

# Validate config lalu reload
php-fpm${PHP_VERSION} -t 2>&1 | grep -v "NOTICE:" || true
POOL_SOCKET="${MYCP_SOCK_DIR}/mycp-${DOMAIN}.sock"
# Cari PID FPM master dari systemctl (lebih akurat)
FPM_MASTER_PID=""
if command -v systemctl >/dev/null 2>&1; then
  FPM_MASTER_PID="$(systemctl show -p MainPID "php${PHP_VERSION}-fpm" 2>/dev/null | sed 's/MainPID=//')"
fi
if [ -z "${FPM_MASTER_PID}" ] || [ "${FPM_MASTER_PID}" = "0" ]; then
  # Fallback: cari dari ps (cocokkan path config)
  FPM_MASTER_PID="$(ps aux | grep "php-fpm: master.*${MYCP_PHP_CONFIG_DIR}/${PHP_VERSION}/fpm/" | grep -v grep | awk '{print $2}' | head -1)"
fi
if [ -n "${FPM_MASTER_PID}" ] && [ "${FPM_MASTER_PID}" != "0" ]; then
  kill -USR2 "${FPM_MASTER_PID}" 2>/dev/null || true
  log "FPM USR2 sent to PID ${FPM_MASTER_PID}"
  # Tunggu socket muncul (max 5 detik)
  for i in 1 2 3 4 5; do
    [ -S "${POOL_SOCKET}" ] && break
    sleep 1
  done
else
  log "FPM master PID untuk PHP ${PHP_VERSION} tidak ditemukan"
fi
# Jika socket belum ada, restart paksa
if [ ! -S "${POOL_SOCKET}" ]; then
  log "Socket ${POOL_SOCKET} belum ada, restart FPM paksa"
  rm -f "${POOL_SOCKET}" "${MYCP_PHP_SOCK_DIR}/php${PHP_VERSION}-fpm.sock" 2>/dev/null || true
  if command -v systemctl >/dev/null 2>&1; then
    systemctl restart "php${PHP_VERSION}-fpm" 2>/dev/null || true
  else
    service "php${PHP_VERSION}-fpm" restart 2>/dev/null || true
  fi
  # Tunggu socket setelah restart
  for i in 1 2 3 4 5; do
    [ -S "${POOL_SOCKET}" ] && break
    sleep 1
  done
fi
[ -S "${POOL_SOCKET}" ] && log "FPM socket ready: ${POOL_SOCKET}" || log "WARNING: Socket ${POOL_SOCKET} masih belum ada"

log "PHP-FPM pool tersimpan: ${POOL_FILE}"
