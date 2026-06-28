const path = require("path");
const fs = require("fs");
const os = require("os");

// Auto-detect APP_USER dari pemilik APP_DIR
const resolvedAppDir = process.env.APP_DIR || __dirname.replace(/\\/g, "/").replace(/\/server$/, "");
let detectedUser = "srv";
try {
  if (process.platform === "linux") {
    const stat = fs.statSync(resolvedAppDir);
    const uid = stat.uid;
    const pwd = fs.readFileSync("/etc/passwd", "utf-8");
    const match = pwd.split("\n").find(l => l.split(":")[2] === String(uid));
    if (match) detectedUser = match.split(":")[0];
  }
} catch (e) { /* fallback ke srv */ }

module.exports = {
  PORT: process.env.PORT || 8089,
  SESSION_SECRET: process.env.SESSION_SECRET || "mycp-secret-key-change-in-production",
  APP_DIR: resolvedAppDir,
  APP_USER: process.env.APP_USER || detectedUser,
  APP_HOME: process.env.APP_HOME || path.join("/home", process.env.APP_USER || detectedUser),
  SESSION_MAX_AGE: 24 * 60 * 60 * 1000,
  PMA_HOST: process.env.PMA_HOST || "127.0.0.1",
  PMA_PORT: process.env.PMA_PORT || 8087,
  NGINX_PORT: process.env.NGINX_PORT || 80,
  NGINX_PREVIEW_PORT: process.env.NGINX_PREVIEW_PORT || 8088,
  UPLOAD_DIR: process.env.UPLOAD_DIR || "/tmp/mycp-uploads/",
  SCRIPTS_DIR: process.env.SCRIPTS_DIR || (__dirname.replace(/\\/g, "/").replace(/\/server$/, "") + "/scripts"),
  // MyControlPanel paths
  MYCP_ETC_DIR: process.env.MYCP_ETC_DIR || "/etc/mycontrolpanel",
  MYCP_SITES_DIR: process.env.MYCP_SITES_DIR || "/etc/mycontrolpanel/sites",
  MYCP_HOME_PREFIX: process.env.MYCP_HOME_PREFIX || "/home",
  MYCP_SOCK_DIR: process.env.MYCP_SOCK_DIR || "/run/php-fpm",
  MYCP_PHP_SOCK_DIR: process.env.MYCP_PHP_SOCK_DIR || "/run/php",
  MYCP_LOG_DIR: process.env.MYCP_LOG_DIR || "/var/log/nginx",
  MYCP_NGINX_DIR: process.env.MYCP_NGINX_DIR || "/etc/nginx",
  MYCP_PHP_CONFIG_DIR: process.env.MYCP_PHP_CONFIG_DIR || "/etc/php",
  MYCP_SSL_DIR: process.env.MYCP_SSL_DIR || "/etc/nginx/ssl",
  MYCP_MYSQL_SOCK: process.env.MYCP_MYSQL_SOCK || "/run/mysqld/mysqld.sock",
  MYCP_MYSQL_PID: process.env.MYCP_MYSQL_PID || "/run/mysqld/mysqld.pid",
  MYCP_MYSQL_RUN_DIR: process.env.MYCP_MYSQL_RUN_DIR || "/run/mysqld",
  MYCP_NGINX_PID: process.env.MYCP_NGINX_PID || "/run/nginx.pid",
  MYCP_VSFTPD_PID: process.env.MYCP_VSFTPD_PID || "/run/vsftpd/vsftpd.pid",
  MYCP_PHP_FPM_LOG_DIR: process.env.MYCP_PHP_FPM_LOG_DIR || "/var/log/php-fpm",
  MYCP_PMA_CONFIG_DIR: process.env.MYCP_PMA_CONFIG_DIR || "/etc/phpmyadmin",
  MYCP_PMA_ROOT: process.env.MYCP_PMA_ROOT || "/usr/share/phpmyadmin",
  MYCP_PM2_HOME: process.env.MYCP_PM2_HOME || path.join("/home", process.env.APP_USER || "srv", ".pm2"),
  MYCP_NGINX_PREFIX: process.env.MYCP_NGINX_PREFIX || "mycp-",
};
