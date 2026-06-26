#!/usr/bin/env bash
set -Eeuo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"
require_root

log "=== MySQL / MariaDB ==="
# Install MariaDB server if missing
if ! command -v mariadbd >/dev/null 2>&1 && ! command -v mysqld >/dev/null 2>&1; then
  log "Installing MariaDB server..."
  DEBIAN_FRONTEND=noninteractive apt-get install -y mariadb-server 2>&1 | tail -3
fi

if [ -S /run/mysqld/mysqld.sock ]; then
  log "MariaDB already running"
else
  if command -v systemctl >/dev/null 2>&1; then
    systemctl start mariadb 2>/dev/null || systemctl start mysql 2>/dev/null || true
  else
    service mariadb start 2>/dev/null || service mysql start 2>/dev/null || true
  fi
  sleep 2
  # Try direct launch if service failed
  if [ ! -S /run/mysqld/mysqld.sock ]; then
    mkdir -p /run/mysqld
    chown mysql:mysql /run/mysqld
    mariadbd --user=mysql --datadir=/var/lib/mysql &
    sleep 3
  fi
fi

# Fix root auth to allow TCP login (needed by phpMyAdmin)
log "Fix root auth for TCP access"
mariadb -e "ALTER USER 'root'@'localhost' IDENTIFIED VIA mysql_native_password USING '';" 2>/dev/null || \
mariadb -e "SET PASSWORD FOR 'root'@'localhost' = '';" 2>/dev/null || true
mariadb -e "FLUSH PRIVILEGES;" 2>/dev/null || true

# Ensure phpmyadmin user exists
mariadb -e "CREATE USER IF NOT EXISTS 'phpmyadmin'@'localhost' IDENTIFIED BY 'phpmyadmin';" 2>/dev/null || true
mariadb -e "GRANT ALL PRIVILEGES ON phpmyadmin.* TO 'phpmyadmin'@'localhost';" 2>/dev/null || true
mariadb -e "FLUSH PRIVILEGES;" 2>/dev/null || true
mariadb -e "CREATE DATABASE IF NOT EXISTS phpmyadmin;" 2>/dev/null || true
if [ -f /usr/share/phpmyadmin/sql/create_tables.sql ]; then
  mariadb phpmyadmin < /usr/share/phpmyadmin/sql/create_tables.sql 2>/dev/null || true
fi

# Write phpmyadmin config if missing
if [ ! -f /etc/phpmyadmin/config-db.php ]; then
  cat > /etc/phpmyadmin/config-db.php <<'EOF'
<?php
$dbuser='phpmyadmin';
$dbpass='phpmyadmin';
$basepath='';
$dbname='phpmyadmin';
$dbserver='localhost';
$dbport='';
$dbtype='mysql';
EOF
fi

# Write phpMyAdmin config with auto-login as root
PMA_CONFIG=/etc/phpmyadmin/config.inc.php
cat > "$PMA_CONFIG" <<'CFG'
<?php
require_once('/etc/phpmyadmin/config-db.php');
$cfg['blowfish_secret'] = 'mycp_secret_key_2026_dev';
$i = 0;
$i++;
$cfg['Servers'][$i]['auth_type'] = 'config';
$cfg['Servers'][$i]['user'] = 'root';
$cfg['Servers'][$i]['password'] = '';
$cfg['Servers'][$i]['host'] = 'localhost';
$cfg['Servers'][$i]['connect_type'] = 'tcp';
$cfg['Servers'][$i]['compress'] = false;
$cfg['Servers'][$i]['AllowNoPassword'] = true;
$cfg['UploadDir'] = '';
$cfg['SaveDir'] = '';
CFG

# Write phpMyAdmin Nginx proxy on port 8087
log "=== Nginx phpMyAdmin proxy on port 8087 ==="
cat > /etc/nginx/sites-available/phpmyadmin <<'NGINX'
server {
    listen 127.0.0.1:8087;
    server_name _;

    root /usr/share/phpmyadmin;
    index index.php index.html;

    access_log /var/log/nginx/phpmyadmin.access.log;
    error_log /var/log/nginx/phpmyadmin.error.log;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/run/php/php8.4-fpm.sock;
    }

    location ~ /\. {
        deny all;
    }
}
NGINX

ln -sfn /etc/nginx/sites-available/phpmyadmin /etc/nginx/sites-enabled/phpmyadmin

log "=== Restart services ==="
nginx -t && nginx -s reload
service php8.4-fpm restart || true

log "=== Done ==="
echo ""
echo "phpMyAdmin available at: http://172.22.127.180:8089/phpmyadmin"
echo "Login with MySQL root or phpmyadmin user"
