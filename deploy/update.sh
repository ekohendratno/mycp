#!/usr/bin/env bash
set -Eeuo pipefail

log()  { printf '\033[1;32m[mycp]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[mycp]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[mycp]\033[0m %s\n' "$*" >&2; exit 1; }

[ "${EUID:-$(id -u)}" -eq 0 ] || fail "Jalankan dengan sudo: sudo bash update.sh"

APP_DIR="${APP_DIR:-}"
if [ -z "$APP_DIR" ]; then
  for candidate in "$PWD" \
    /home/srv/mycp /home/srv/cp \
    /home/*/mycp /home/*/cp \
    /opt/mycontrolpanel; do
    if [ -f "$candidate/server/server.js" ]; then
      APP_DIR="$candidate"
      break
    fi
  done
fi
[ -n "$APP_DIR" ] || fail "Tidak ditemukan instalasi MyCP. Coba: APP_DIR=/path/ke/mycp sudo bash update.sh"
[ -f "${APP_DIR}/server/server.js" ] || fail "${APP_DIR} bukan direktori MyCP (server/server.js tidak ditemukan)"

log "Update MyControlPanel di ${APP_DIR}"

REPO_URL="${REPO_URL:-https://github.com/ekohendratno/mycp/archive/refs/heads/main.zip}"
TMP_DIR="$(mktemp -d)"

log "Download archive..."
if command -v curl >/dev/null 2>&1; then
  curl -fsSL "$REPO_URL" -o "$TMP_DIR/mycp.zip"
elif command -v wget >/dev/null 2>&1; then
  wget -q "$REPO_URL" -O "$TMP_DIR/mycp.zip"
else
  fail "curl/wget tidak tersedia"
fi

log "Extract..."
unzip -q "$TMP_DIR/mycp.zip" -d "$TMP_DIR"
SRC_DIR="$(find "$TMP_DIR" -maxdepth 1 -type d -name 'mycp-*' | head -n 1)"
[ -n "$SRC_DIR" ] || fail "Gagal mengekstrak archive"

log "Copy file..."
rsync -a --delete \
  --exclude=".git" \
  --exclude="node_modules" \
  --exclude="data" \
  "${SRC_DIR}/" "${APP_DIR}/"
rm -rf "$TMP_DIR"

log "Set script permissions..."
find "${APP_DIR}/scripts" -name '*.sh' -exec chmod +x {} +
chmod +x "${APP_DIR}/server/server.js" 2>/dev/null || true

log "Install dependencies..."
if [ -s /root/.nvm/nvm.sh ]; then
  export NVM_DIR="/root/.nvm"
  \. "$NVM_DIR/nvm.sh"
fi
cd "${APP_DIR}"
npm install --production 2>&1 || warn "npm install gagal"
npm rebuild 2>&1 || warn "npm rebuild gagal"

log "Restart service..."
if systemctl is-active --quiet mycp-server 2>/dev/null; then
  systemctl restart mycp-server
  log "Service mycp-server restarted"
elif systemctl is-active --quiet mycontrolpanel 2>/dev/null; then
  systemctl restart mycontrolpanel
  log "Service mycontrolpanel restarted"
else
  warn "Service tidak ditemukan, restart manual diperlukan"
fi

log "Update selesai!"
