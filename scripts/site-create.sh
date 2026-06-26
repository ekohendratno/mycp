#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

DOMAIN=""
USERNAME=""
PASSWORD=""
RUNTIME="php"
PHP_VERSION="8.4"
NODE_VERSION="20"
LARAVEL_VERSION=""
DB_TYPE="none"
APP_PORT="80"
SSL_ENABLED="no"
FTP_ENABLED="yes"
CLONE_SOURCE="no"
ROOT_DIR=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --user|--username) USERNAME="${2:-}"; shift 2 ;;
    --password) PASSWORD="${2:-}"; shift 2 ;;
    --runtime) RUNTIME="${2:-}"; shift 2 ;;
    --php-version) PHP_VERSION="${2:-}"; shift 2 ;;
    --node-version) NODE_VERSION="${2:-}"; shift 2 ;;
    --database) DB_TYPE="${2:-}"; shift 2 ;;
    --port) APP_PORT="${2:-}"; shift 2 ;;
    --ssl) SSL_ENABLED="${2:-yes}"; shift 2 ;;
    --ftp) FTP_ENABLED="${2:-yes}"; shift 2 ;;
    --clone-source) CLONE_SOURCE="${2:-no}"; shift 2 ;;
    --laravel-version) LARAVEL_VERSION="${2:-}"; shift 2 ;;
    --root) ROOT_DIR="${2:-}"; shift 2 ;;
    *) fail "Argumen tidak dikenal: $1" ;;
  esac
done

require_root
need_cmd useradd
need_cmd nginx
require_domain "${DOMAIN}"
require_user "${USERNAME}"

[ -n "${PASSWORD}" ] || fail "--password wajib diisi"
[ -n "${ROOT_DIR}" ] || ROOT_DIR="/home/${USERNAME}/htdocs"
require_path "${ROOT_DIR}"

if id "${USERNAME}" >/dev/null 2>&1; then
  log "User ${USERNAME} sudah ada"
else
  useradd -m -s /bin/bash "${USERNAME}"
fi

echo "${USERNAME}:${PASSWORD}" | chpasswd
usermod -aG www-data "${USERNAME}" || true
mkdir -p "${ROOT_DIR}"
mkdir -p "/home/${USERNAME}/tmp"
chown -R "${USERNAME}:${USERNAME}" "/home/${USERNAME}"
chmod 755 "/home/${USERNAME}" "${ROOT_DIR}" "/home/${USERNAME}/tmp"

if [ "${CLONE_SOURCE}" = "yes" ]; then
  case "${RUNTIME}" in
    laravel)
      if [ ! -f "${ROOT_DIR}/artisan" ]; then
        LARAVEL_REQ="laravel/laravel"
        [ -n "${LARAVEL_VERSION}" ] && LARAVEL_REQ="laravel/laravel:^${LARAVEL_VERSION}"
        su - "${USERNAME}" -c "composer create-project ${LARAVEL_REQ} ${ROOT_DIR} --no-interaction 2>&1" || log "WARNING: composer create-project laravel/laravel gagal"
        chmod -R 775 "${ROOT_DIR}/storage" "${ROOT_DIR}/bootstrap/cache" 2>/dev/null || true
        su - "${USERNAME}" -c "php ${ROOT_DIR}/artisan key:generate 2>&1" || true
        chown -R "${USERNAME}:www-data" "${ROOT_DIR}/storage" "${ROOT_DIR}/bootstrap/cache" 2>/dev/null || true
      fi ;;
    "codeigniter 4"|ci4)
      if [ ! -f "${ROOT_DIR}/spark" ]; then
        su - "${USERNAME}" -c "composer create-project codeigniter4/appstarter ${ROOT_DIR} --no-interaction 2>&1" || log "WARNING: composer create-project codeigniter4/appstarter gagal"
        chown -R "${USERNAME}:${USERNAME}" "${ROOT_DIR}" 2>/dev/null || true
      fi ;;
    "codeigniter 3"|ci3)
      if [ ! -f "${ROOT_DIR}/index.php" ]; then
        CI3_URL="https://github.com/bcit-ci/CodeIgniter/archive/refs/tags/3.1.13.zip"
        TMP_ZIP="/tmp/ci3-${DOMAIN}.zip"
        wget -q "${CI3_URL}" -O "${TMP_ZIP}" 2>/dev/null || curl -sL "${CI3_URL}" -o "${TMP_ZIP}" || true
        if [ -f "${TMP_ZIP}" ]; then
          TMP_DIR="/tmp/ci3-extract-${DOMAIN}"
          mkdir -p "${TMP_DIR}"
          unzip -q "${TMP_ZIP}" -d "${TMP_DIR}" 2>/dev/null || true
          cp -r "${TMP_DIR}/CodeIgniter-3.1.13/"* "${ROOT_DIR}/" 2>/dev/null || true
          rm -rf "${TMP_DIR}" "${TMP_ZIP}"
          chown -R "${USERNAME}:${USERNAME}" "${ROOT_DIR}" 2>/dev/null || true
        fi
      fi ;;
    node)
      if [ ! -f "${ROOT_DIR}/package.json" ]; then
        su - "${USERNAME}" -c "cd '${ROOT_DIR}' && npm init -y 2>&1" || true
      fi ;;
  esac
fi

# Default landing page + startup untuk Node.js
if [ "${RUNTIME}" = "node" ]; then
  if [ ! -f "${ROOT_DIR}/server.js" ] && [ ! -f "${ROOT_DIR}/index.html" ] && [ ! -f "${ROOT_DIR}/app.js" ]; then
    sed "s/__DOMAIN__/${DOMAIN}/g; s/__PORT__/${APP_PORT}/g" "${SCRIPT_DIR}/../templates/node-server.js.template" > "${ROOT_DIR}/server.js"
    chown "${USERNAME}:${USERNAME}" "${ROOT_DIR}/server.js"
    chmod +x "${ROOT_DIR}/server.js"
  fi
  # Start via PM2 jika belum jalan
  su - "${USERNAME}" -c "pm2 start '${ROOT_DIR}/server.js' --name '${DOMAIN}' --silent 2>&1" || true
  su - "${USERNAME}" -c "pm2 save --silent 2>&1" || true
elif [ ! -f "${ROOT_DIR}/index.html" ] && [ ! -f "${ROOT_DIR}/index.php" ]; then
  # Default landing page: hello world + versi PHP/Node yang aktif.
  # Dipakai baik untuk runtime php maupun node (php menghasilkan versi PHP,
  # node fallback menampilkan info server Node).
  cat >"${ROOT_DIR}/index.php" <<PHP
<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<title>${DOMAIN}</title>
<style>
  body { font-family: -apple-system, "Segoe UI", Arial, sans-serif;
         background: #0f172a; color: #e2e8f0; margin: 0; padding: 60px 20px;
         display: flex; align-items: center; justify-content: center; min-height: 100vh; }
  .card { background: #1e293b; border: 1px solid #334155; border-radius: 14px;
          padding: 36px 48px; box-shadow: 0 14px 36px rgba(0,0,0,0.35);
          text-align: center; max-width: 640px; }
  h1 { margin: 0 0 12px; font-size: 34px; color: #60a5fa; }
  p.lead { font-size: 16px; color: #cbd5e1; margin: 0 0 24px; }
  pre { background: #0b1220; border: 1px solid #334155; border-radius: 10px;
        padding: 16px 20px; text-align: left; font-family: "JetBrains Mono", monospace;
        font-size: 13px; color: #93c5fd; margin: 0; overflow-x: auto; }
  small { display: block; margin-top: 20px; color: #64748b; font-size: 12px; }
</style>
</head>
<body>
  <div class="card">
    <h1>Hello, world!</h1>
    <p class="lead">Website <strong>${DOMAIN}</strong> berhasil dibuat.</p>
    <pre><?php
echo "PHP version : " . PHP_VERSION . PHP_EOL;
echo "PHP SAPI    : " . PHP_SAPI . PHP_EOL;
echo "Server      : " . (\$_SERVER['SERVER_SOFTWARE'] ?? 'unknown') . PHP_EOL;
echo "Document    : " . (\$_SERVER['DOCUMENT_ROOT'] ?? '') . PHP_EOL;
echo "Runtime     : " . (\$_SERVER['SERVER_NAME'] ?? '') . PHP_EOL;
echo "Time        : " . date('Y-m-d H:i:s T') . PHP_EOL;
?></pre>
    <small>Default landing page &mdash; replace dengan aplikasi Anda.</small>
  </div>
</body>
</html>
PHP
  chown "${USERNAME}:${USERNAME}" "${ROOT_DIR}/index.php"
fi

# Buat PHP-FPM pool khusus website ini (supaya setting php.ini per-site berlaku)
case "${RUNTIME}" in
  php|laravel|codeigniter|ci4|ci3)
  "${SCRIPT_DIR}/phpini-save.sh" \
    --domain "${DOMAIN}" \
    --user "${USERNAME}" \
    --php-version "${PHP_VERSION}" \
    --set "memory_limit=512M" \
    --set "max_execution_time=60" \
    --set "upload_max_filesize=64M" \
    --set "post_max_size=64M" \
    --set "display_errors=on" || log "WARNING: phpini-save.sh gagal, pool mungkin belum terbuat"
    ;;
esac

"${SCRIPT_DIR}/vhost-save.sh" \
  --domain "${DOMAIN}" \
  --root "${ROOT_DIR}" \
  --runtime "${RUNTIME}" \
  --php-version "${PHP_VERSION}" \
  --port "${APP_PORT}"

case "${DB_TYPE}" in
  mysql|mariadb|postgres|postgresql)
    DB_NAME="${USERNAME}_db"
    DB_USER="${USERNAME}_dbu"
    "${SCRIPT_DIR}/database-create.sh" \
      --domain "${DOMAIN}" \
      --type "${DB_TYPE}" \
      --database "${DB_NAME}" \
      --user "${DB_USER}" \
      --password "${PASSWORD}" || true
    ;;
  none|"") ;;
  *) fail "Database tidak didukung: ${DB_TYPE}" ;;
esac

if [ "${FTP_ENABLED}" = "yes" ]; then
  "${SCRIPT_DIR}/ftp-create.sh" --domain "${DOMAIN}" --user "${USERNAME}" --password "${PASSWORD}" --path "${ROOT_DIR}" || true
fi

if [ "${SSL_ENABLED}" = "yes" ]; then
  "${SCRIPT_DIR}/ssl-issue.sh" --domain "${DOMAIN}" --email "admin@${DOMAIN}" || true
elif [ "${SSL_ENABLED}" = "self" ]; then
  "${SCRIPT_DIR}/ssl-self.sh" --domain "${DOMAIN}" || true
fi

write_site_metadata "${DOMAIN}" "${USERNAME}" "${ROOT_DIR}" "${RUNTIME}" "${PHP_VERSION}" "${NODE_VERSION}" "${APP_PORT}" "${DB_TYPE}" "${SSL_ENABLED}" "${FTP_ENABLED}" "running"
log "Website dibuat: ${DOMAIN}"
