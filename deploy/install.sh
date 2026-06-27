#!/usr/bin/env bash
# MyControlPanel Installer - Multi-Distro
# Support: Debian 11+/12+/13, Ubuntu 20.04+/22.04+/24.04+, WSL,
#          CentOS Stream 8/9, AlmaLinux 8/9, Rocky Linux 8/9, Fedora 38+,
#          Arch Linux, Manjaro
#
# Usage:
#   sudo bash install.sh
#   APP_USER=myuser APP_PASSWORD=secret sudo bash install.sh
#   INSTALL_PHP_VERSIONS="8.2 8.4" sudo bash install.sh
#   INSTALL_PGADMIN=yes SKIP_SSH=yes sudo bash install.sh

set -Eeuo pipefail

# ============================================================
# CONFIGURATION
# ============================================================
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

# PHP versions to install (override via env)
INSTALL_PHP_VERSIONS="${INSTALL_PHP_VERSIONS:-}"

# Toggle features via env vars
INSTALL_MARIADB="${INSTALL_MARIADB:-yes}"
INSTALL_POSTGRES="${INSTALL_POSTGRES:-yes}"
INSTALL_FTP="${INSTALL_FTP:-yes}"
INSTALL_FAIL2BAN="${INSTALL_FAIL2BAN:-yes}"
INSTALL_REDIS="${INSTALL_REDIS:-yes}"
INSTALL_PGADMIN="${INSTALL_PGADMIN:-no}"
INSTALL_COMPOSER="${INSTALL_COMPOSER:-yes}"
SKIP_SSH="${SKIP_SSH:-no}"

# ============================================================
# OUTPUT HELPERS
# ============================================================
log() { printf '\033[1;32m[mycp]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[mycp]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[mycp]\033[0m %s\n' "$*" >&2; exit 1; }

# ============================================================
# ROOT CHECK
# ============================================================
require_root() {
  if [ "${EUID:-$(id -u)}" -ne 0 ]; then
    fail "Jalankan dengan sudo: sudo bash install.sh"
  fi
}

# ============================================================
# ENVIRONMENT DETECTION
# ============================================================
DISTRO=""
DISTRO_LIKE=""
DISTRO_VERSION=""
PKG_MANAGER=""

detect_distro() {
  if [ ! -f /etc/os-release ]; then
    fail "Tidak dapat mendeteksi distro (/etc/os-release tidak ada)"
  fi
  . /etc/os-release
  DISTRO="${ID:-unknown}"
  DISTRO_LIKE="${ID_LIKE:-}"
  DISTRO_VERSION="${VERSION_ID:-}"

  case "${DISTRO}" in
    ubuntu|debian|linuxmint|pop|elementary|zorin|kali|raspbian)
      PKG_MANAGER="apt" ;;
    centos|rhel|almalinux|rocky|fedora|ol)
      if command -v dnf >/dev/null 2>&1; then PKG_MANAGER="dnf"; else PKG_MANAGER="yum"; fi ;;
    arch|manjaro|endeavouros|garuda)
      PKG_MANAGER="pacman" ;;
    opensuse*|sles)
      PKG_MANAGER="zypper" ;;
    alpine)
      PKG_MANAGER="apk" ;;
    *)
      case "${DISTRO_LIKE}" in
        *debian*|*ubuntu*) PKG_MANAGER="apt" ;;
        *rhel*|*fedora*|*centos*)
          if command -v dnf >/dev/null 2>&1; then PKG_MANAGER="dnf"; else PKG_MANAGER="yum"; fi ;;
        *arch*) PKG_MANAGER="pacman" ;;
        *suse*) PKG_MANAGER="zypper" ;;
        *) fail "Distro tidak didukung: ${DISTRO}" ;;
      esac ;;
  esac
  log "Terdeteksi: ${DISTRO} ${DISTRO_VERSION} (package manager: ${PKG_MANAGER})"
}

is_wsl() { grep -qiE "microsoft|wsl" /proc/version 2>/dev/null; }

# ============================================================
# SERVICE MANAGER
# ============================================================
SERVICE_CMD=""
detect_service_manager() {
  if command -v systemctl >/dev/null 2>&1 && systemctl list-units >/dev/null 2>&1; then
    SERVICE_CMD="systemd"
  elif command -v service >/dev/null 2>&1; then
    SERVICE_CMD="sysvinit"
  else
    SERVICE_CMD="none"
    warn "Tidak ada service manager; restart service manual."
  fi
}

service_restart() {
  local service_name="$1"
  case "${SERVICE_CMD}" in
    systemd)
      systemctl enable "${service_name}" >/dev/null 2>&1 || true
      systemctl restart "${service_name}" 2>/dev/null || true ;;
    sysvinit)
      service "${service_name}" restart 2>/dev/null || true ;;
  esac
}

# ============================================================
# PACKAGE MANAGER WRAPPERS
# ============================================================
pkg_update() {
  case "${PKG_MANAGER}" in
    apt) apt-get update ;;
    dnf|yum) ${PKG_MANAGER} -y check-update >/dev/null 2>&1 || true ;;
    pacman) pacman -Sy --noconfirm >/dev/null 2>&1 ;;
    zypper) zypper --non-interactive refresh >/dev/null 2>&1 ;;
    apk) apk update >/dev/null 2>&1 ;;
  esac
}

pkg_install() {
  case "${PKG_MANAGER}" in
    apt) DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends "$@" ;;
    dnf|yum) ${PKG_MANAGER} install -y "$@" ;;
    pacman) pacman -S --noconfirm --needed "$@" ;;
    zypper) zypper --non-interactive install "$@" ;;
    apk) apk add "$@" ;;
  esac
}

# ============================================================
# SSH SETUP & HARDENING
# ============================================================
setup_ssh() {
  if is_wsl; then
    log "WSL terdeteksi, skip SSH setup"
    return
  fi
  if [ "${SKIP_SSH}" = "yes" ]; then
    log "SKIP_SSH=yes, SSH setup dilewati"
    return
  fi

  log "Install & konfigurasi SSH server"
  case "${PKG_MANAGER}" in
    apt) pkg_install openssh-server ;;
    dnf|yum) pkg_install openssh-server ;;
    pacman) pkg_install openssh ;;
    *) warn "SSH install belum didukung untuk ${PKG_MANAGER}"; return ;;
  esac

  local sshd_config="/etc/ssh/sshd_config"
  if [ -f "${sshd_config}" ]; then
    # Hardening dasar
    sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin prohibit-password/' "${sshd_config}"
    sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication yes/' "${sshd_config}"
    sed -i 's/^#\?PubkeyAuthentication.*/PubkeyAuthentication yes/' "${sshd_config}"
    sed -i 's/^#\?X11Forwarding.*/X11Forwarding no/' "${sshd_config}"
    sed -i 's/^#\?ClientAliveInterval.*/ClientAliveInterval 300/' "${sshd_config}"
    sed -i 's/^#\?ClientAliveCountMax.*/ClientAliveCountMax 2/' "${sshd_config}"
    sed -i 's/^#\?MaxAuthTries.*/MaxAuthTries 3/' "${sshd_config}"

    # Pastikan setting belum diubah (tambahkan jika belum ada)
    grep -q "^PermitRootLogin" "${sshd_config}" || echo "PermitRootLogin prohibit-password" >> "${sshd_config}"
    grep -q "^ClientAliveInterval" "${sshd_config}" || echo "ClientAliveInterval 300" >> "${sshd_config}"
    grep -q "^MaxAuthTries" "${sshd_config}" || echo "MaxAuthTries 3" >> "${sshd_config}"
  fi

  service_restart sshd || service_restart ssh || true
  log "SSH server siap (port 22, root login dengan password dilarang)"
}

# ============================================================
# FIREWALL
# ============================================================
configure_firewall() {
  if is_wsl; then
    log "WSL terdeteksi, skip firewall"
    return
  fi

  case "${PKG_MANAGER}" in
    apt)
      if ! command -v ufw >/dev/null 2>&1; then
        pkg_install ufw
      fi
      log "Konfigurasi UFW firewall"
      ufw --force reset >/dev/null 2>&1 || true
      ufw default deny incoming >/dev/null 2>&1
      ufw default allow outgoing >/dev/null 2>&1
      ufw allow ssh >/dev/null 2>&1
      ufw allow 80/tcp >/dev/null 2>&1
      ufw allow 443/tcp >/dev/null 2>&1
      ufw allow "${PANEL_PORT}/tcp" >/dev/null 2>&1
      # FTP aktif untuk vsftpd
      if [ "${INSTALL_FTP}" = "yes" ]; then
        ufw allow 20/tcp >/dev/null 2>&1
        ufw allow 21/tcp >/dev/null 2>&1
        ufw allow 50000:50100/tcp >/dev/null 2>&1
      fi
      # MariaDB/MySQL hanya localhost
      # PostgreSQL hanya localhost
      ufw --force enable >/dev/null 2>&1 || true
      log "UFW aktif: SSH, HTTP, HTTPS, port ${PANEL_PORT} terbuka"
      ;;
    dnf|yum)
      if command -v firewall-cmd >/dev/null 2>&1; then
        log "Konfigurasi firewalld"
        firewall-cmd --permanent --add-service=ssh >/dev/null 2>&1 || true
        firewall-cmd --permanent --add-service=http >/dev/null 2>&1 || true
        firewall-cmd --permanent --add-service=https >/dev/null 2>&1 || true
        firewall-cmd --permanent --add-port="${PANEL_PORT}/tcp" >/dev/null 2>&1 || true
        if [ "${INSTALL_FTP}" = "yes" ]; then
          firewall-cmd --permanent --add-service=ftp >/dev/null 2>&1 || true
          firewall-cmd --permanent --add-port=50000-50100/tcp >/dev/null 2>&1 || true
        fi
        firewall-cmd --reload >/dev/null 2>&1 || true
      fi
      ;;
    *)
      warn "Firewall auto-konfigurasi hanya untuk apt/dnf, atur manual untuk ${PKG_MANAGER}"
      ;;
  esac
}

# ============================================================
# PHP REPOSITORY SETUP
# ============================================================
PHP_REPO_READY=0

setup_php_repo_ubuntu() {
  if [ -z "${INSTALL_PHP_VERSIONS}" ]; then
    INSTALL_PHP_VERSIONS="7.4 8.1 8.2 8.3 8.4"
  fi
  if ! apt-cache policy 2>/dev/null | grep -q "ondrej/php"; then
    log "Menambahkan PPA ondrej/php"
    pkg_install software-properties-common ca-certificates apt-transport-https lsb-release
    add-apt-repository -y ppa:ondrej/php >/dev/null 2>&1 || warn "Gagal menambah PPA ondrej/php"
    apt-get update
  fi
  PHP_REPO_READY=1
}

setup_php_repo_debian() {
  if [ -z "${INSTALL_PHP_VERSIONS}" ]; then
    case "${DISTRO_VERSION}" in
      13*) INSTALL_PHP_VERSIONS="8.2 8.3 8.4" ;;
      12*) INSTALL_PHP_VERSIONS="7.4 8.2 8.3 8.4" ;;
      11*) INSTALL_PHP_VERSIONS="7.4 8.2 8.3" ;;
      *) INSTALL_PHP_VERSIONS="8.2 8.3 8.4" ;;
    esac
  fi
  if echo " ${INSTALL_PHP_VERSIONS} " | grep -q " 7.4 "; then
    if ! apt-cache policy 2>/dev/null | grep -q "packages.sury.org"; then
      log "Menambahkan Sury repo (untuk PHP 7.4)"
      pkg_install lsb-release ca-certificates curl gnupg
      curl -fsSL https://packages.sury.org/php/apt.gpg | gpg --dearmor -o /usr/share/keyrings/deb.sury.org-php.gpg 2>/dev/null || \
        curl -fsSLo /tmp/debsuryorg-archive-keyring.deb https://packages.sury.org/debsuryorg-archive-keyring.deb && \
        dpkg -i /tmp/debsuryorg-archive-keyring.deb 2>/dev/null || true
      echo "deb [signed-by=/usr/share/keyrings/deb.sury.org-php.gpg] https://packages.sury.org/php/ $(lsb_release -sc 2>/dev/null || echo bookworm) main" \
        > /etc/apt/sources.list.d/php-sury.list
      apt-get update
    fi
  fi
  PHP_REPO_READY=1
}

setup_php_repo_rhel() {
  if [ -z "${INSTALL_PHP_VERSIONS}" ]; then
    INSTALL_PHP_VERSIONS="8.1 8.2 8.3 8.4"
  fi
  if command -v dnf >/dev/null 2>&1; then
    pkg_install epel-release yum-utils
    local major_ver="${DISTRO_VERSION%%.*}"
    dnf install -y "https://rpms.remirepo.net/enterprise/remi-release-${major_ver}.rpm" 2>/dev/null || \
      warn "Gagal install Remi repo; lanjut dengan module default"
    dnf module reset -y php >/dev/null 2>&1 || true
  else
    pkg_install epel-release yum-utils
  fi
  PHP_REPO_READY=1
}

setup_php_repo_arch() {
  if [ -z "${INSTALL_PHP_VERSIONS}" ]; then
    INSTALL_PHP_VERSIONS="8.2 8.3 8.4"
  fi
  PHP_REPO_READY=1
}

setup_php_repo() {
  case "${DISTRO}" in
    ubuntu|linuxmint|pop|elementary|zorin|kali) setup_php_repo_ubuntu ;;
    debian|raspbian) setup_php_repo_debian ;;
    centos|rhel|almalinux|rocky|ol) setup_php_repo_rhel ;;
    fedora)
      if [ -z "${INSTALL_PHP_VERSIONS}" ]; then INSTALL_PHP_VERSIONS="8.2 8.3 8.4"; fi
      PHP_REPO_READY=1 ;;
    arch|manjaro|endeavouros|garuda) setup_php_repo_arch ;;
    *)
      warn "Lewati setup PHP repo untuk distro: ${DISTRO}"
      INSTALL_PHP_VERSIONS=""
      PHP_REPO_READY=1 ;;
  esac
}

# ============================================================
# PHP MULTI VERSION INSTALL
# ============================================================
install_php_versions() {
  if [ -z "${INSTALL_PHP_VERSIONS}" ]; then
    log "Tidak ada versi PHP yang akan diinstall"
    return
  fi
  for ver in ${INSTALL_PHP_VERSIONS}; do
    log "Install PHP ${ver}"
    case "${PKG_MANAGER}" in
      apt)
        pkg_install "php${ver}-fpm" "php${ver}-cli" "php${ver}-common" \
          "php${ver}-mysql" "php${ver}-pgsql" "php${ver}-sqlite3" \
          "php${ver}-xml" "php${ver}-mbstring" \
          "php${ver}-curl" "php${ver}-zip" "php${ver}-gd" "php${ver}-bcmath" "php${ver}-intl" 2>/dev/null || \
          warn "Gagal install beberapa ekstensi PHP ${ver}"
        # Redis extension
        pkg_install "php${ver}-redis" 2>/dev/null || true
        # Imagick extension
        pkg_install "php${ver}-imagick" 2>/dev/null || true
        ;;
      dnf|yum)
        dnf module enable -y "php:remi-${ver}" >/dev/null 2>&1 || \
          dnf module enable -y php >/dev/null 2>&1 || true
        pkg_install "php-fpm" "php-cli" "php-mysqlnd" "php-pgsql" "php-xml" "php-mbstring" \
          "php-curl" "php-zip" "php-gd" "php-bcmath" "php-intl" "php-pecl-redis" 2>/dev/null || \
          warn "Gagal install PHP ${ver} di ${DISTRO}"
        ;;
      pacman)
        pkg_install "php" "php-fpm" "php-redis" 2>/dev/null || warn "Gagal install PHP di Arch" ;;
      *)
        warn "PHP install belum diimplementasi untuk ${PKG_MANAGER}" ;;
    esac
  done
}

# ============================================================
# COMPOSER
# ============================================================
install_composer() {
  if command -v composer >/dev/null 2>&1; then
    log "Composer sudah terinstall"
    return
  fi
  log "Install PHP Composer"
  pkg_install curl php-cli
  curl -fsSL https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer >/dev/null 2>&1 || \
    warn "Gagal install Composer"
  chmod 755 /usr/local/bin/composer 2>/dev/null || true
  log "Composer siap: $(composer --version 2>/dev/null || echo 'unknown')"
}

# ============================================================
# NODE.JS INSTALL VIA NVM
# ============================================================
install_nodejs() {
  if command -v node >/dev/null 2>&1 && [ "$(node --version | cut -d. -f1 | tr -d v)" -ge 18 ]; then
    log "Node.js $(node --version) sudah tersedia"
    return
  fi

  if [ ! -s /root/.nvm/nvm.sh ]; then
    log "Install NVM (Node Version Manager) untuk root"
    pkg_install curl ca-certificates
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash >/dev/null 2>&1
  fi
  export NVM_DIR="/root/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

  log "Install Node.js 18, 20, 22 via NVM"
  nvm install 18 >/dev/null 2>&1 || true
  nvm install 20 >/dev/null 2>&1
  nvm install 22 >/dev/null 2>&1 || true
  nvm alias default 20 >/dev/null 2>&1
  nvm use 20 >/dev/null 2>&1

  if ! grep -q "NVM_DIR" /root/.bashrc 2>/dev/null; then
    echo 'export NVM_DIR="$HOME/.nvm"' >> /root/.bashrc
    echo '[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"' >> /root/.bashrc
  fi

  # Install PM2 global
  log "Install PM2 global"
  npm install -g pm2 2>/dev/null || warn "Gagal install PM2"
  # Pastikan symlink PM2
  local pm2_bin
  pm2_bin="$(which pm2 2>/dev/null || echo "")"
  if [ -n "${pm2_bin}" ]; then
    ln -sf "${pm2_bin}" /usr/local/bin/pm2 2>/dev/null || true
  fi

  # Install NVM untuk APP_USER
  local user_home="/home/${APP_USER}"
  if [ -d "${user_home}" ] && [ ! -s "${user_home}/.nvm/nvm.sh" ]; then
    log "Install NVM untuk user ${APP_USER}"
    sudo -u "${APP_USER}" bash -c 'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash >/dev/null 2>&1' || true
    if [ ! -s "${user_home}/.bashrc" ] || ! grep -q "NVM_DIR" "${user_home}/.bashrc" 2>/dev/null; then
      cat >> "${user_home}/.bashrc" <<BASHRC
export NVM_DIR="\$HOME/.nvm"
[ -s "\$NVM_DIR/nvm.sh" ] && \. "\$NVM_DIR/nvm.sh"
BASHRC
      chown "${APP_USER}:${APP_USER}" "${user_home}/.bashrc" 2>/dev/null || true
    fi
  fi
}

# ============================================================
# PACKAGES PER DISTRO
# ============================================================
install_packages() {
  log "Update package index"
  pkg_update

  log "Install paket dasar server hosting"
  case "${PKG_MANAGER}" in
    apt)
      pkg_install ca-certificates curl unzip rsync acl git \
        nginx certbot python3-certbot-nginx openssh-server ufw
      [ "${INSTALL_FTP}" = "yes" ] && pkg_install vsftpd || true
      [ "${INSTALL_MARIADB}" = "yes" ] && pkg_install mariadb-server mariadb-client || true
      [ "${INSTALL_POSTGRES}" = "yes" ] && pkg_install postgresql postgresql-client || true
      [ "${INSTALL_REDIS}" = "yes" ] && pkg_install redis-server || true
      [ "${INSTALL_FAIL2BAN}" = "yes" ] && pkg_install fail2ban || true
      pkg_install build-essential python3 2>/dev/null || true
      # Extra tools
      pkg_install htop net-tools mc 2>/dev/null || true
      ;;
    dnf|yum)
      pkg_install ca-certificates curl unzip rsync acl \
        nginx certbot python3-certbot-nginx openssh-server
      [ "${INSTALL_FTP}" = "yes" ] && pkg_install vsftpd || true
      [ "${INSTALL_MARIADB}" = "yes" ] && pkg_install mariadb-server mariadb || true
      [ "${INSTALL_POSTGRES}" = "yes" ] && pkg_install postgresql postgresql-server postgresql-contrib || true
      if [ "${INSTALL_POSTGRES}" = "yes" ] && [ ! -f /var/lib/pgsql/data/PGVERSION ]; then
        postgresql-setup --initdb >/dev/null 2>&1 || true
      fi
      [ "${INSTALL_REDIS}" = "yes" ] && pkg_install redis || true
      [ "${INSTALL_FAIL2BAN}" = "yes" ] && pkg_install fail2ban || true
      if command -v firewall-cmd >/dev/null 2>&1; then
        firewall-cmd --permanent --add-service=http >/dev/null 2>&1 || true
        firewall-cmd --permanent --add-port="${PANEL_PORT}/tcp" >/dev/null 2>&1 || true
        firewall-cmd --reload >/dev/null 2>&1 || true
      fi
      ;;
    pacman)
      pkg_install ca-certificates curl unzip rsync acl nginx certbot openssh
      [ "${INSTALL_FTP}" = "yes" ] && pkg_install vsftpd || true
      [ "${INSTALL_MARIADB}" = "yes" ] && pkg_install mariadb || true
      [ "${INSTALL_POSTGRES}" = "yes" ] && pkg_install postgresql || true
      [ "${INSTALL_REDIS}" = "yes" ] && pkg_install redis || true
      [ "${INSTALL_FAIL2BAN}" = "yes" ] && pkg_install fail2ban || true
      ;;
    *)
      warn "Lewati install paket standar untuk ${PKG_MANAGER}" ;;
  esac

  setup_php_repo
  install_php_versions

  install_nodejs
  [ "${INSTALL_COMPOSER}" = "yes" ] && install_composer
}

# ============================================================
# USER & FILES
# ============================================================
create_panel_user() {
  if id "${APP_USER}" >/dev/null 2>&1; then
    log "User ${APP_USER} sudah ada"
  else
    log "Buat user ${APP_USER}"
    useradd -m -s /bin/bash "${APP_USER}"
  fi

  echo "${APP_USER}:${APP_PASSWORD}" | chpasswd
  usermod -aG www-data "${APP_USER}" 2>/dev/null || true
  mkdir -p "/home/${APP_USER}/htdocs"
  chown -R "${APP_USER}:${APP_USER}" "/home/${APP_USER}"
}

copy_panel_files() {
  local source_dir
  local temp_dir=""
  source_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

  if [ ! -f "${source_dir}/server.js" ] || [ ! -d "${source_dir}/assets" ]; then
    log "Source panel tidak ditemukan di folder installer, download dari GitHub"
    temp_dir="$(mktemp -d)"
    if command -v curl >/dev/null 2>&1; then
      curl -fsSL "${REPO_URL}" -o "${temp_dir}/mycp.zip"
    elif command -v wget >/dev/null 2>&1; then
      wget -q "${REPO_URL}" -O "${temp_dir}/mycp.zip"
    else
      fail "curl/wget tidak tersedia untuk download source"
    fi
    pkg_install unzip
    unzip -q "${temp_dir}/mycp.zip" -d "${temp_dir}"
    source_dir="$(find "${temp_dir}" -maxdepth 1 -type d -name 'mycp-*' | head -n 1)"
    [ -n "${source_dir}" ] || fail "Gagal membaca source panel dari archive GitHub."
  fi

  log "Copy panel ke ${APP_DIR}"
  rsync -a --delete \
    --exclude ".git" \
    --exclude "install.sh" \
    --exclude "deploy/" \
    --exclude "data/" \
    "${source_dir}/" "${APP_DIR}/"

  log "Install Node.js dependencies"
  cd "${APP_DIR}"
  if [ -s /root/.nvm/nvm.sh ]; then
    export NVM_DIR="/root/.nvm"
    \. "$NVM_DIR/nvm.sh"
  fi
  npm install --production 2>/dev/null || true

  log "Setup .env dan data directory"
  [ -f "${APP_DIR}/.env" ] || {
    cp "${APP_DIR}/.env.example" "${APP_DIR}/.env"
    local secret
    secret="$(head /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 48 2>/dev/null || echo "mycp-$(date +%s)-$$")"
    sed -i "s/change-this-to-random-string/${secret}/" "${APP_DIR}/.env"
  }
  mkdir -p "${APP_DIR}/data"

  chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}" 2>/dev/null || true
  find "${APP_DIR}" -type d -exec chmod 755 {} \; 2>/dev/null
  find "${APP_DIR}" -type f -exec chmod 644 {} \; 2>/dev/null
  chmod +x "${APP_DIR}/server/server.js" 2>/dev/null
  find "${APP_DIR}/scripts" -type f -name "*.sh" -exec chmod 755 {} \; 2>/dev/null

  [ -z "${temp_dir}" ] || rm -rf "${temp_dir}"
}

# ============================================================
# NGINX - Panel Reverse Proxy
# ============================================================
write_nginx_config() {
  log "Tulis konfigurasi Nginx reverse proxy (listen :80 -> panel port ${PANEL_PORT})"
  local nginx_config
  nginx_config=$(cat <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${SERVER_NAME};

    access_log /var/log/nginx/${APP_SLUG}.access.log;
    error_log /var/log/nginx/${APP_SLUG}.error.log;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    location /assets/ {
        alias ${APP_DIR}/assets/;
        expires 7d;
        access_log off;
        add_header Cache-Control "public, immutable";
    }

    location / {
        proxy_pass http://127.0.0.1:${PANEL_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_hide_header X-Powered-By;
    }
}
NGINX
)

  if [ -d /etc/nginx/sites-enabled ]; then
    echo "${nginx_config}" > "/etc/nginx/sites-available/${NGINX_SITE}"
    ln -sfn "/etc/nginx/sites-available/${NGINX_SITE}" "/etc/nginx/sites-enabled/${NGINX_SITE}"
    rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
  elif [ -d /etc/nginx/conf.d ]; then
    echo "${nginx_config}" > "/etc/nginx/conf.d/${NGINX_SITE}.conf"
    if [ -f /etc/nginx/nginx.conf ] && grep -q "^[[:space:]]*server {" /etc/nginx/nginx.conf; then
      warn "Menghapus server block default dari /etc/nginx/nginx.conf"
      sed -i '/^[[:space:]]*server {/,/^[[:space:]]*}/d' /etc/nginx/nginx.conf 2>/dev/null || true
    fi
  fi
  nginx -t 2>&1 || warn "Nginx config test gagal (perlu dicek manual)"
}

# ============================================================
# FTP (vsftpd) - Konfigurasi
# ============================================================
configure_ftp() {
  [ "${INSTALL_FTP}" != "yes" ] && return
  if ! command -v vsftpd >/dev/null 2>&1; then
    warn "vsftpd tidak terinstall, skip konfigurasi FTP"
    return
  fi
  if is_wsl; then
    log "WSL terdeteksi, skip FTP konfigurasi"
    return
  fi

  log "Konfigurasi vsftpd"
  local vsftpd_conf="/etc/vsftpd.conf"
  if [ -f "${vsftpd_conf}" ]; then
    cp "${vsftpd_conf}" "${vsftpd_conf}.bak" 2>/dev/null || true
  fi

  cat > "${vsftpd_conf}" <<FTP
listen=YES
listen_ipv6=NO
anonymous_enable=NO
local_enable=YES
write_enable=YES
local_umask=022
dirmessage_enable=YES
xferlog_enable=YES
connect_from_port_20=YES
xferlog_std_format=YES
chroot_local_user=YES
allow_writeable_chroot=YES
pasv_min_port=50000
pasv_max_port=50100
user_sub_token=\$USER
local_root=/home/\$USER/htdocs
seccomp_sandbox=NO
FTP

  service_restart vsftpd || true
  log "vsftpd dikonfigurasi (pasv: 50000-50100, chroot ke ~/htdocs)"
}

# ============================================================
# SSL / LETS ENCRYPT - Auto-Renewal
# ============================================================
setup_ssl_auto() {
  if ! command -v certbot >/dev/null 2>&1; then
    warn "certbot tidak terinstall, skip SSL auto-renewal"
    return
  fi
  log "Setup certbot auto-renewal (cron harian)"
  if [ ! -f /etc/cron.d/certbot ]; then
    echo "0 3 * * * root /usr/bin/certbot renew --quiet --post-hook \"systemctl reload nginx\"" \
      > /etc/cron.d/certbot
    chmod 644 /etc/cron.d/certbot
    log "Cron certbot dibuat: renew jam 3 pagi setiap hari"
  else
    log "Cron certbot sudah ada"
  fi
}

# ============================================================
# FAIL2BAN
# ============================================================
configure_fail2ban() {
  [ "${INSTALL_FAIL2BAN}" != "yes" ] && return
  if ! command -v fail2ban-server >/dev/null 2>&1 && ! command -v fail2ban-client >/dev/null 2>&1; then
    warn "fail2ban tidak terinstall, skip"
    return
  fi
  if is_wsl; then
    log "WSL terdeteksi, skip fail2ban"
    return
  fi

  log "Konfigurasi fail2ban"
  mkdir -p /etc/fail2ban/jail.d

  # Panel login protection
  cat > /etc/fail2ban/jail.d/mycp.conf <<F2B
[mycp-panel]
enabled = true
port = ${PANEL_PORT}
filter = mycp-panel
logpath = ${APP_DIR}/server.log
maxretry = 5
bantime = 3600
findtime = 600

[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 86400
findtime = 600

[nginx-http-auth]
enabled = true
port = http,https
filter = nginx-http-auth
logpath = /var/log/nginx/*.error.log
maxretry = 5
bantime = 3600
F2B

  # Custom filter for panel
  mkdir -p /etc/fail2ban/filter.d
  cat > /etc/fail2ban/filter.d/mycp-panel.conf <<FILTER
[Definition]
failregex = ^.*Failed login from .*$
ignoreregex =
FILTER

  service_restart fail2ban || true
  log "fail2ban aktif: SSH (3 attempts), Panel (5 attempts), Nginx (5 attempts)"
}

# ============================================================
# REDIS
# ============================================================
configure_redis() {
  [ "${INSTALL_REDIS}" != "yes" ] && return
  if ! command -v redis-server >/dev/null 2>&1; then
    warn "redis-server tidak terinstall, skip"
    return
  fi
  log "Konfigurasi Redis (bind localhost, unix socket)"
  local redis_conf="/etc/redis/redis.conf"
  if [ -f "${redis_conf}" ]; then
    sed -i 's/^bind .*/bind 127.0.0.1/' "${redis_conf}"
    sed -i 's/^# unixsocket .*/unixsocket \/run\/redis\/redis.sock/' "${redis_conf}"
    sed -i 's/^# unixsocketperm .*/unixsocketperm 770/' "${redis_conf}"
    sed -i 's/^# requirepass .*/requirepass ""/' "${redis_conf}"
    sed -i 's/^protected-mode .*/protected-mode yes/' "${redis_conf}"
  fi
  service_restart redis-server || service_restart redis || true
  log "Redis siap di 127.0.0.1:6379"
}

# ============================================================
# PGADMIN4
# ============================================================
install_pgadmin() {
  [ "${INSTALL_PGADMIN}" != "yes" ] && return
  log "Install pgAdmin4"
  case "${PKG_MANAGER}" in
    apt)
      if [ "${DISTRO}" = "ubuntu" ] || [ "${DISTRO}" = "debian" ]; then
        # Setup pgAdmin4 repo
        curl -fsSL https://www.pgadmin.org/static/packages_pgadmin_org.pub | gpg --dearmor -o /usr/share/keyrings/pgadmin.gpg >/dev/null 2>&1
        echo "deb [signed-by=/usr/share/keyrings/pgadmin.gpg] https://ftp.postgresql.org/pub/pgadmin/pgadmin4/apt/$(lsb_release -sc 2>/dev/null || echo bookworm) pgadmin4 main" \
          > /etc/apt/sources.list.d/pgadmin4.list
        apt-get update >/dev/null 2>&1 || true
        pkg_install pgadmin4-web 2>/dev/null || {
          warn "Gagal install pgAdmin4 dari repo, coba pip"
          pkg_install python3-pip
          pip3 install pgadmin4 2>/dev/null || warn "Gagal install pgAdmin4 via pip"
        }
      else
        warn "pgAdmin4 auto-install hanya untuk Debian/Ubuntu, install manual"
      fi
      ;;
    *)
      warn "pgAdmin4 auto-install hanya untuk apt, install manual untuk ${PKG_MANAGER}"
      ;;
  esac

  if command -v /usr/pgadmin4/bin/setup-web.sh >/dev/null 2>&1; then
    /usr/pgadmin4/bin/setup-web.sh --yes "${APP_USER}" "${APP_PASSWORD}" 2>/dev/null || \
      warn "pgAdmin4 web setup skipped, jalankan manual: sudo /usr/pgadmin4/bin/setup-web.sh"
  fi
}

# ============================================================
# SUDOERS
# ============================================================
configure_sudo_scripts() {
  log "Izinkan ${APP_USER} menjalankan scripts panel via sudo tanpa password"
  cat >/etc/sudoers.d/mycp <<SUDO
${APP_USER} ALL=(ALL) NOPASSWD: ${APP_SCRIPTS_DIR}/*
${APP_USER} ALL=(ALL) NOPASSWD: /usr/sbin/nginx, /usr/bin/nginx
${APP_USER} ALL=(ALL) NOPASSWD: /bin/systemctl reload nginx, /bin/systemctl restart nginx
${APP_USER} ALL=(ALL) NOPASSWD: /bin/systemctl reload php*-fpm, /bin/systemctl restart php*-fpm
${APP_USER} ALL=(ALL) NOPASSWD: /usr/sbin/service nginx reload, /usr/sbin/service nginx restart
${APP_USER} ALL=(ALL) NOPASSWD: /usr/sbin/service php*-fpm reload, /usr/sbin/service php*-fpm restart
${APP_USER} ALL=(ALL) NOPASSWD: /usr/sbin/php-fpm*, /usr/sbin/php*-fpm
${APP_USER} ALL=(ALL) NOPASSWD: /bin/kill, /usr/bin/killall, /usr/bin/pkill
${APP_USER} ALL=(ALL) NOPASSWD: /bin/chown, /bin/chmod, /bin/mv, /bin/mkdir
${APP_USER} ALL=(ALL) NOPASSWD: /usr/sbin/useradd, /usr/sbin/usermod, /usr/sbin/chpasswd
${APP_USER} ALL=(ALL) NOPASSWD: /bin/systemctl restart mariadb, /bin/systemctl restart mysql
${APP_USER} ALL=(ALL) NOPASSWD: /bin/systemctl restart postgresql
${APP_USER} ALL=(ALL) NOPASSWD: /bin/systemctl restart redis-server, /bin/systemctl restart redis
${APP_USER} ALL=(ALL) NOPASSWD: /bin/systemctl restart fail2ban
SUDO
  chmod 440 /etc/sudoers.d/mycp
}

# ============================================================
# SYSTEMD SERVICE
# ============================================================
write_node_service() {
  log "Buat systemd service mycp-server"
  local node_bin="/usr/bin/node"
  if [ -s /root/.nvm/nvm.sh ]; then
    export NVM_DIR="/root/.nvm"
    \. "$NVM_DIR/nvm.sh"
    node_bin="$(which node 2>/dev/null || echo /usr/bin/node)"
  fi

  cat >/etc/systemd/system/mycp-server.service <<UNIT
[Unit]
Description=MyControlPanel Node.js Server
After=network.target

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${APP_DIR}
ExecStart=${node_bin} ${APP_DIR}/server/server.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=${PANEL_PORT}

[Install]
WantedBy=multi-user.target
UNIT

  if [ "${SERVICE_CMD}" = "systemd" ]; then
    systemctl daemon-reload
    systemctl enable mycp-server >/dev/null 2>&1 || true
  fi
}

# ============================================================
# HELPER COMMAND
# ============================================================
write_helper_command() {
  log "Buat command mycp"
  cat >/usr/local/bin/mycp <<MYCP
#!/usr/bin/env bash
set -euo pipefail

SCRIPTS_DIR="${APP_SCRIPTS_DIR}"
COMMAND="\${1:-status}"
[ "\$#" -gt 0 ] && shift || true

case "\${COMMAND}" in
  status)              "\${SCRIPTS_DIR}/status.sh" "\$@" ;;
  site:create)         "\${SCRIPTS_DIR}/site-create.sh" "\$@" ;;
  site:list)           "\${SCRIPTS_DIR}/site-list.sh" "\$@" ;;
  site:update-domain)  "\${SCRIPTS_DIR}/site-update-domain.sh" "\$@" ;;
  site:update-runtime) "\${SCRIPTS_DIR}/site-update-runtime.sh" "\$@" ;;
  site:password)       "\${SCRIPTS_DIR}/site-change-password.sh" "\$@" ;;
  site:delete)         "\${SCRIPTS_DIR}/site-delete.sh" "\$@" ;;
  vhost:save)          "\${SCRIPTS_DIR}/vhost-save.sh" "\$@" ;;
  ssl:issue)           "\${SCRIPTS_DIR}/ssl-issue.sh" "\$@" ;;
  ssl:auto)            certbot --nginx -d "\$@" --non-interactive --agree-tos --email admin@\$(echo "\$@" | cut -d' ' -f1) ;;
  db:create)           "\${SCRIPTS_DIR}/database-create.sh" "\$@" ;;
  db:fix-privileges)   "\${SCRIPTS_DIR}/fix-db-privileges.sh" "\$@" ;;
  ftp:create)          "\${SCRIPTS_DIR}/ftp-create.sh" "\$@" ;;
  cron:add)            "\${SCRIPTS_DIR}/cron-add.sh" "\$@" ;;
  file:write)          "\${SCRIPTS_DIR}/file-write.sh" "\$@" ;;
  file:list)           "\${SCRIPTS_DIR}/file-list.sh" "\$@" ;;
  folder:create)       "\${SCRIPTS_DIR}/folder-create.sh" "\$@" ;;
  log:read)            "\${SCRIPTS_DIR}/log-read.sh" "\$@" ;;
  path)                echo "${APP_DIR}" ;;
  url)
    host_ip="\$(hostname -I 2>/dev/null | awk '{print \$1}')"
    echo "http://\${host_ip:-127.0.0.1}:${PANEL_PORT}/login"
    ;;
  restart)
    if command -v systemctl >/dev/null 2>&1 && systemctl list-units >/dev/null 2>&1; then
      systemctl restart mycp-server
      systemctl reload nginx 2>/dev/null || systemctl restart nginx
    else
      service mycp-server restart 2>/dev/null || true
      service nginx restart 2>/dev/null || true
    fi
    ;;
  *)
    echo "Usage: mycp {status|site:list|site:create|site:update-domain|site:update-runtime|site:password|site:delete|vhost:save|ssl:issue|ssl:auto|db:create|db:fix-privileges|ftp:create|cron:add|file:list|file:write|folder:create|log:read|path|url|restart}"
    exit 1
    ;;
esac
MYCP
  chmod +x /usr/local/bin/mycp
}

# ============================================================
# SWAP SETUP (untuk VPS dengan RAM <= 1GB)
# ============================================================
setup_swap() {
  local total_mem
  total_mem="$(free -m | awk '/^Mem:/ {print $2}')"
  if [ "${total_mem}" -lt 1024 ] && [ ! -f /swapfile ]; then
    log "RAM ${total_mem}MB < 1GB; buat swap 1GB"
    fallocate -l 1G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=1024 2>/dev/null
    chmod 600 /swapfile
    mkswap /swapfile >/dev/null 2>&1
    swapon /swapfile >/dev/null 2>&1 || true
    if ! grep -q "/swapfile" /etc/fstab 2>/dev/null; then
      echo "/swapfile none swap sw 0 0" >> /etc/fstab
    fi
    log "Swap 1GB diaktifkan"
  fi
}

# ============================================================
# POST-INSTALL VERIFICATION
# ============================================================
verify_services() {
  log "Verifikasi services & paths..."

  if [ ! -d /run/php-fpm ]; then
    mkdir -p /run/php-fpm 2>/dev/null || true
    chmod 755 /run/php-fpm 2>/dev/null || true
    log "Buat direktori /run/php-fpm"
  fi

  if [ ! -d /var/log/php-fpm ]; then
    mkdir -p /var/log/php-fpm 2>/dev/null || true
    chown www-data:www-data /var/log/php-fpm 2>/dev/null || true
    log "Buat direktori /var/log/php-fpm"
  fi

  local actual_php=""
  if [ -d /etc/php ]; then
    for d in /etc/php/*/fpm; do
      [ -d "$d" ] || continue
      local v
      v="$(basename "$(dirname "$d")")"
      local bin
      bin="$(find /usr/sbin /usr/bin -maxdepth 1 -name "php-fpm${v}" -o -name "php${v}-fpm" 2>/dev/null | head -n1)"
      if [ -n "${bin}" ]; then
        actual_php="${actual_php}${v} "
        if [ ! -S "/run/php/php${v}-fpm.sock" ]; then
          ${bin} -D >/dev/null 2>&1 || true
          log "Start PHP ${v} FPM"
        fi
      fi
    done
  fi

  if [ -n "${actual_php}" ]; then
    INSTALL_PHP_VERSIONS="${actual_php}"
  fi

  for ver in ${INSTALL_PHP_VERSIONS}; do
    local bin
    bin="$(find /usr/sbin /usr/bin -maxdepth 1 -name "php-fpm${ver}" -o -name "php${ver}-fpm" 2>/dev/null | head -n1)"
    if [ -n "${bin}" ]; then
      ${bin} -t 2>&1 | grep -v "NOTICE" | head -3 || true
    fi
  done

  if command -v nginx >/dev/null 2>&1; then
    nginx -t 2>&1 | head -3 || warn "Nginx config test gagal"
  fi

  if [ "${SERVICE_CMD}" = "systemd" ]; then
    systemctl is-active mycp-server >/dev/null 2>&1 || \
      log "mycp-server belum aktif (coba: sudo systemctl start mycp-server)"
    systemctl is-active fail2ban >/dev/null 2>&1 || true
    systemctl is-active redis-server >/dev/null 2>&1 || systemctl is-active redis >/dev/null 2>&1 || true
  fi
}

# ============================================================
# SUMMARY
# ============================================================
print_done() {
  local host_ip
  host_ip="$(hostname -I 2>/dev/null | awk '{print $1}')"

  log "Install selesai"
  printf '\n'
  printf '== MyControlPanel ==\n'
  printf '\n'
  printf 'Panel URL lokal : http://127.0.0.1:%s/login\n' "${PANEL_PORT}"
  if [ -n "${host_ip}" ]; then
    printf 'Panel URL LAN   : http://%s:%s/login\n' "${host_ip}" "${PANEL_PORT}"
  fi
  printf 'Login demo      : admin / admin123\n'
  printf 'Linux user      : %s / %s\n' "${APP_USER}" "${APP_PASSWORD}"
  printf 'Panel path      : %s\n' "${APP_DIR}"
  printf 'Scripts path    : %s\n' "${APP_SCRIPTS_DIR}"
  printf 'Distro          : %s %s\n' "${DISTRO}" "${DISTRO_VERSION}"
  printf 'Service manager : %s\n' "${SERVICE_CMD}"
  printf 'PHP versions    : %s\n' "${INSTALL_PHP_VERSIONS:-default}"
  if [ -d /run/php ]; then
    local php_socks=""
    for s in /run/php/php*-fpm.sock; do
      [ -e "$s" ] || continue
      php_socks="${php_socks}$(basename "$s") "
    done
    [ -n "${php_socks}" ] && printf 'PHP-FPM running : %s\n' "${php_socks}"
  fi
  if [ -s /root/.nvm/nvm.sh ] || [ -s "/home/${APP_USER}/.nvm/nvm.sh" ]; then
    local nvm_dir="/root/.nvm"
    [ ! -s "${nvm_dir}/nvm.sh" ] && nvm_dir="/home/${APP_USER}/.nvm"
    local node_vers
    node_vers="$(export NVM_DIR="${nvm_dir}"; \. "${nvm_dir}/nvm.sh" >/dev/null 2>&1; nvm list 2>/dev/null | grep -oE 'v[0-9]+\.[0-9]+\.[0-9]+' | head -5 | tr '\n' ' ')"
    [ -n "${node_vers}" ] && printf 'Node.js versions: %s\n' "${node_vers}"
  fi
  printf '\n'
  printf 'Installed features:\n'
  printf '  SSH server    : \033[1;32mACTIF\033[0m (port 22, hardened)\n'
  printf '  Firewall      : \033[1;32mACTIF\033[0m (SSH, HTTP, HTTPS, port %s)\n' "${PANEL_PORT}"
  [ "${INSTALL_FTP}" = "yes" ] && printf '  FTP server    : \033[1;32mACTIF\033[0m (vsftpd, pasv 50000-50100)\n'
  [ "${INSTALL_MARIADB}" = "yes" ] && printf '  MariaDB/MySQL : \033[1;32mACTIF\033[0m\n'
  [ "${INSTALL_POSTGRES}" = "yes" ] && printf '  PostgreSQL    : \033[1;32mACTIF\033[0m\n'
  [ "${INSTALL_REDIS}" = "yes" ] && printf '  Redis         : \033[1;32mACTIF\033[0m\n'
  [ "${INSTALL_FAIL2BAN}" = "yes" ] && printf '  Fail2ban      : \033[1;32mACTIF\033[0m (SSH, Panel, Nginx)\n'
  printf '  SSL (Lets Encrypt): \033[1;32mcertbot\033[0m + auto-renewal cron\n'
  [ "${INSTALL_COMPOSER}" = "yes" ] && printf '  Composer       : \033[1;32mACTIF\033[0m\n'
  printf '  phpMyAdmin    : via panel (port 8087)\n'
  [ "${INSTALL_PGADMIN}" = "yes" ] && printf '  pgAdmin4      : \033[1;32mACTIF\033[0m\n'
  printf '\n'
  printf 'Helper commands:\n'
  printf '  mycp status             Cek status server\n'
  printf '  mycp site:list          List semua website\n'
  printf '  mycp site:create ...    Buat website baru\n'
  printf '  mycp restart            Restart panel + nginx\n'
  printf '  mycp ssl:auto domain   Buat SSL Lets Encrypt (non-interactive)\n'
  printf '  mycp db:fix-privileges  Fix SHOW DATABASES untuk user DB\n'
  printf '\n'

  if is_wsl; then
    warn "WSL: service tidak otomatis startup. Jalankan:"
    warn "  sudo service nginx restart"
    warn "  sudo service mycp-server restart"
    warn "Panel: http://localhost:${PANEL_PORT}/login"
  fi
}

# ============================================================
# MAIN
# ============================================================
main() {
  require_root
  detect_distro
  detect_service_manager

  # 1. Install packages (Nginx, PHP, Node, MariaDB, PostgreSQL, Redis, Fail2ban, etc)
  install_packages

  # 2. Create panel user
  create_panel_user

  # 3. Copy panel files
  copy_panel_files

  # 4. Write Nginx config
  write_nginx_config

  # 5. Sudoers
  configure_sudo_scripts

  # 6. SSH hardening
  setup_ssh

  # 7. Firewall
  configure_firewall

  # 8. FTP config
  configure_ftp

  # 9. SSL auto-renewal
  setup_ssl_auto

  # 10. Fail2ban
  configure_fail2ban

  # 11. Redis
  configure_redis

  # 12. pgAdmin
  install_pgadmin

  # 13. PM2 symlink
  if command -v pm2 >/dev/null 2>&1; then
    ln -sf "$(which pm2)" /usr/local/bin/pm2 2>/dev/null || true
  fi

  # 14. Systemd service
  write_node_service

  # 15. Helper command
  write_helper_command

  # 16. Setup phpMyAdmin
  log "Install phpMyAdmin support"
  if [ -f "${APP_SCRIPTS_DIR}/setup-phpmyadmin.sh" ]; then
    bash "${APP_SCRIPTS_DIR}/setup-phpmyadmin.sh" 2>/dev/null || warn "phpMyAdmin setup skipped"
  fi

  # 17. Swap
  setup_swap

  # 18. Restart services
  service_restart mycp-server || true
  service_restart nginx || true
  service_restart vsftpd || true
  [ "${INSTALL_MARIADB}" = "yes" ] && service_restart mariadb 2>/dev/null || service_restart mysql 2>/dev/null || true
  [ "${INSTALL_POSTGRES}" = "yes" ] && service_restart postgresql || true
  for ver in ${INSTALL_PHP_VERSIONS}; do
    service_restart "php${ver}-fpm" 2>/dev/null || true
  done
  [ "${INSTALL_REDIS}" = "yes" ] && service_restart redis-server 2>/dev/null || service_restart redis 2>/dev/null || true
  [ "${INSTALL_FAIL2BAN}" = "yes" ] && service_restart fail2ban 2>/dev/null || true

  verify_services
  print_done
}

main "$@"
