#!/usr/bin/env bash
set -Eeuo pipefail

SRC="${SRC:-/mnt/c/laragon/www/mycp}"
DST="${DST:-/opt/mycontrolpanel}"

echo "Deploying scripts..."
cp "$SRC/scripts/vhost-save.sh" "$DST/scripts/vhost-save.sh"
chmod +x "$DST/scripts/vhost-save.sh"

echo "Deploying views..."
cp -r "$SRC/views/" "$DST/views/"

echo "Deploying assets..."
cp -r "$SRC/assets/" "$DST/assets/"

echo "Deploying server code..."
cp "$SRC/server/server.js" "$DST/server/server.js"
cp "$SRC/server/app.js" "$DST/server/app.js"
cp "$SRC/server/config.js" "$DST/server/config.js"
cp -r "$SRC/server/routes/" "$DST/server/routes/"

echo "Installing xterm..."
cd "$DST"
npm install xterm @xterm/addon-fit 2>&1

echo "Creating vendor symlinks..."
mkdir -p "$DST/assets/vendor"
ln -sfn "$DST/node_modules/xterm" "$DST/assets/vendor/xterm"
ln -sfn "$DST/node_modules/@xterm" "$DST/assets/vendor/@xterm"

echo "Fix permissions..."
CHOWN_USER="${CHOWN_USER:-srv:srv}"
chown -R "$CHOWN_USER" "$DST/scripts" "$DST/assets" "$DST/views" "$DST/server"

echo "Deploy selesai"
