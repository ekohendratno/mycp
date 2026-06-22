#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="MyControlPanel"
APP_SLUG="mycontrolpanel"
APP_USER="${APP_USER:-srv}"
APP_PASSWORD="${APP_PASSWORD:-srV@1234}"
APP_DIR="${APP_DIR:-/opt/${APP_SLUG}}"
APP_PUBLIC_DIR="${APP_PUBLIC_DIR:-${APP_DIR}/public}"
APP_SCRIPTS_DIR="${APP_SCRIPTS_DIR:-${APP_DIR}/scripts}"
NGINX_SITE="${NGINX_SITE:-${APP_SLUG}}"
SERVER_NAME="${SERVER_NAME:-_}"
PANEL_PORT="${PANEL_PORT:-8089}"
REPO_URL="${REPO_URL:-https://github.com/ekohendratno/mycp/archive/refs/heads/main.zip}"

log() {
  printf '\033[1;32m[mycp]\033[0m %s\n' "$*"
}

warn() {
  printf '\033[1;33m[mycp]\033[0m %s\n' "$*"
}

fail() {
  printf '\033[1;31m[mycp]\033[0m %s\n' "$*" >&2
  exit 1
}

require_root() {
  if [ "${EUID}" -ne 0 ]; then
    fail "Jalankan dengan sudo: sudo bash install.sh"
  fi
}

detect_apt() {
  if ! command -v apt-get >/dev/null 2>&1; then
    fail "Installer awal ini mendukung Ubuntu/Debian/WSL yang memakai apt-get."
  fi
}

is_wsl() {
  grep -qiE "microsoft|wsl" /proc/version 2>/dev/null
}

service_restart() {
  local service_name="$1"
  if command -v systemctl >/dev/null 2>&1 && systemctl list-units >/dev/null 2>&1; then
    systemctl enable "$service_name" >/dev/null 2>&1 || true
    systemctl restart "$service_name"
    return
  fi

  if command -v service >/dev/null 2>&1; then
    service "$service_name" restart
    return
  fi

  warn "Tidak bisa restart service ${service_name}; jalankan manual bila perlu."
}

install_packages() {
  log "Update package index"
  apt-get update

  log "Install paket dasar server hosting"
  DEBIAN_FRONTEND=noninteractive apt-get install -y \
    ca-certificates \
    curl \
    unzip \
    rsync \
    ufw \
    acl \
    nginx \
    php-fpm \
    php-cli \
    php-mysql \
    php-pgsql \
    php-curl \
    php-mbstring \
    php-xml \
    php-zip \
    php-gd \
    mariadb-server \
    postgresql \
    nodejs \
    npm \
    certbot \
    python3-certbot-nginx \
    vsftpd
}

create_panel_user() {
  if id "${APP_USER}" >/dev/null 2>&1; then
    log "User ${APP_USER} sudah ada"
  else
    log "Buat user ${APP_USER}"
    useradd -m -s /bin/bash "${APP_USER}"
  fi

  echo "${APP_USER}:${APP_PASSWORD}" | chpasswd
  usermod -aG www-data "${APP_USER}" || true
  mkdir -p "/home/${APP_USER}/htdocs"
  chown -R "${APP_USER}:${APP_USER}" "/home/${APP_USER}"
}

copy_panel_files() {
  local source_dir
  local temp_dir=""
  source_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

  if [ ! -f "${source_dir}/index.html" ] || [ ! -d "${source_dir}/assets" ]; then
    log "Source panel tidak ditemukan di folder installer, download dari GitHub"
    temp_dir="$(mktemp -d)"
    curl -fsSL "${REPO_URL}" -o "${temp_dir}/mycp.zip"
    unzip -q "${temp_dir}/mycp.zip" -d "${temp_dir}"
    source_dir="$(find "${temp_dir}" -maxdepth 1 -type d -name 'mycp-*' | head -n 1)"
    [ -n "${source_dir}" ] || fail "Gagal membaca source panel dari archive GitHub."
  fi

  log "Copy panel ke ${APP_PUBLIC_DIR}"
  mkdir -p "${APP_PUBLIC_DIR}"
  rsync -a --delete \
    --exclude ".git" \
    --exclude "install.sh" \
    --exclude "scripts" \
    "${source_dir}/" "${APP_PUBLIC_DIR}/"

  chown -R www-data:www-data "${APP_DIR}"
  find "${APP_DIR}" -type d -exec chmod 755 {} \;
  find "${APP_DIR}" -type f -exec chmod 644 {} \;

  if [ -d "${source_dir}/scripts" ]; then
    mkdir -p "${APP_SCRIPTS_DIR}"
    rsync -a --delete "${source_dir}/scripts/" "${APP_SCRIPTS_DIR}/"
    chown -R root:root "${APP_SCRIPTS_DIR}"
    find "${APP_SCRIPTS_DIR}" -type d -exec chmod 755 {} \;
    find "${APP_SCRIPTS_DIR}" -type f -name "*.sh" -exec chmod 755 {} \;
    find "${APP_SCRIPTS_DIR}" -type f ! -name "*.sh" -exec chmod 644 {} \;
  fi

  [ -z "${temp_dir}" ] || rm -rf "${temp_dir}"
}

write_nginx_config() {
  log "Tulis konfigurasi Nginx port ${PANEL_PORT}"
  cat >"/etc/nginx/sites-available/${NGINX_SITE}" <<NGINX
server {
    listen ${PANEL_PORT};
    listen [::]:${PANEL_PORT};
    server_name ${SERVER_NAME};

    root ${APP_PUBLIC_DIR};
    index login.html index.html;

    access_log /var/log/nginx/${APP_SLUG}.access.log;
    error_log /var/log/nginx/${APP_SLUG}.error.log;

    location / {
        try_files \$uri \$uri/ /login.html;
    }

    location ~* \.(?:css|js|ico|png|jpg|jpeg|gif|svg|webp|woff2?)$ {
        try_files \$uri =404;
        expires 7d;
        access_log off;
    }

    location ~ /\. {
        deny all;
    }
}
NGINX

  ln -sfn "/etc/nginx/sites-available/${NGINX_SITE}" "/etc/nginx/sites-enabled/${NGINX_SITE}"
  rm -f /etc/nginx/sites-enabled/default
  nginx -t
}

configure_firewall() {
  if command -v ufw >/dev/null 2>&1; then
    log "Buka port Nginx ${PANEL_PORT}"
    ufw allow "${PANEL_PORT}/tcp" >/dev/null 2>&1 || true
  fi
}

write_helper_command() {
  log "Buat command mycp"
  cat >/usr/local/bin/mycp <<MYCP
#!/usr/bin/env bash
set -euo pipefail

SCRIPTS_DIR="${APP_SCRIPTS_DIR}"
COMMAND="\${1:-status}"
[ "\$#" -gt 0 ] && shift || true

case "\${COMMAND}" in
  status)
    "\${SCRIPTS_DIR}/status.sh" "\$@"
    ;;
  site:create)
    "\${SCRIPTS_DIR}/site-create.sh" "\$@"
    ;;
  site:list)
    "\${SCRIPTS_DIR}/site-list.sh" "\$@"
    ;;
  site:update-domain)
    "\${SCRIPTS_DIR}/site-update-domain.sh" "\$@"
    ;;
  site:update-runtime)
    "\${SCRIPTS_DIR}/site-update-runtime.sh" "\$@"
    ;;
  site:password)
    "\${SCRIPTS_DIR}/site-change-password.sh" "\$@"
    ;;
  site:delete)
    "\${SCRIPTS_DIR}/site-delete.sh" "\$@"
    ;;
  vhost:save)
    "\${SCRIPTS_DIR}/vhost-save.sh" "\$@"
    ;;
  ssl:issue)
    "\${SCRIPTS_DIR}/ssl-issue.sh" "\$@"
    ;;
  db:create)
    "\${SCRIPTS_DIR}/database-create.sh" "\$@"
    ;;
  ftp:create)
    "\${SCRIPTS_DIR}/ftp-create.sh" "\$@"
    ;;
  cron:add)
    "\${SCRIPTS_DIR}/cron-add.sh" "\$@"
    ;;
  file:write)
    "\${SCRIPTS_DIR}/file-write.sh" "\$@"
    ;;
  file:list)
    "\${SCRIPTS_DIR}/file-list.sh" "\$@"
    ;;
  folder:create)
    "\${SCRIPTS_DIR}/folder-create.sh" "\$@"
    ;;
  log:read)
    "\${SCRIPTS_DIR}/log-read.sh" "\$@"
    ;;
  path)
    echo "/opt/mycontrolpanel/public"
    ;;
  url)
    host_ip="\$(hostname -I 2>/dev/null | awk '{print \$1}')"
    echo "http://\${host_ip:-127.0.0.1}:${PANEL_PORT}/login.html"
    ;;
  restart)
    service nginx restart
    ;;
  *)
    echo "Usage: mycp {status|site:list|site:create|site:update-domain|site:update-runtime|site:password|site:delete|vhost:save|ssl:issue|db:create|ftp:create|cron:add|file:list|file:write|folder:create|log:read|path|url|restart}"
    exit 1
    ;;
esac
MYCP
  chmod +x /usr/local/bin/mycp
}

print_done() {
  local host_ip
  host_ip="$(hostname -I 2>/dev/null | awk '{print $1}')"

  log "Install selesai"
  printf '\n'
  printf 'Panel URL lokal : http://127.0.0.1:%s/login.html\n' "${PANEL_PORT}"
  if [ -n "${host_ip}" ]; then
    printf 'Panel URL WSL   : http://%s:%s/login.html\n' "${host_ip}" "${PANEL_PORT}"
  fi
  printf 'Login demo      : admin / admin123\n'
  printf 'Linux user      : %s / %s\n' "${APP_USER}" "${APP_PASSWORD}"
  printf 'Panel path      : %s\n' "${APP_PUBLIC_DIR}"
  printf 'Scripts path    : %s\n' "${APP_SCRIPTS_DIR}"
  printf '\n'
  printf 'Command cek     : mycp status\n'
  printf 'Restart Nginx   : sudo mycp restart\n'
  printf '\n'

  if is_wsl; then
    warn "Terdeteksi WSL. Jika service tidak otomatis hidup setelah reboot WSL, jalankan: sudo service nginx restart"
  fi
}

main() {
  require_root
  detect_apt
  install_packages
  create_panel_user
  copy_panel_files
  write_nginx_config
  configure_firewall
  write_helper_command
  service_restart nginx
  service_restart vsftpd || true
  print_done
}

main "$@"
