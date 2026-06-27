const path = require("path");

module.exports = {
  PORT: process.env.PORT || 8089,
  SESSION_SECRET: process.env.SESSION_SECRET || "mycp-secret-key-change-in-production",
  APP_DIR: __dirname.replace(/\\/g, "/").replace(/\/server$/, ""),
  SESSION_MAX_AGE: 24 * 60 * 60 * 1000,
  PMA_HOST: process.env.PMA_HOST || "127.0.0.1",
  PMA_PORT: process.env.PMA_PORT || 8087,
  NGINX_PORT: process.env.NGINX_PORT || 80,
  NGINX_PREVIEW_PORT: process.env.NGINX_PREVIEW_PORT || 8088,
  UPLOAD_DIR: "/tmp/mycp-uploads/",
};
