#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

log() { printf '\033[1;32m[mycp]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[mycp]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[mycp]\033[0m %s\n' "$*" >&2; exit 1; }

[ "${EUID:-$(id -u)}" -eq 0 ] || fail "Jalankan dengan sudo."

log "Update MyControlPanel di ${APP_DIR}"

if [ -d "${APP_DIR}/.git" ]; then
  log "Mode git: git pull origin main"
  cd "${APP_DIR}"
  git fetch origin main 2>&1 || warn "git fetch gagal"
  git reset --hard origin/main 2>&1 || warn "git reset gagal"
else
  log "Mode download: ambil archive dari GitHub"
  REPO_URL="${REPO_URL:-https://github.com/ekohendratno/mycp/archive/refs/heads/main.zip}"
  TMP_DIR="$(mktemp -d)"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "${REPO_URL}" -o "${TMP_DIR}/mycp.zip"
  elif command -v wget >/dev/null 2>&1; then
    wget -q "${REPO_URL}" -O "${TMP_DIR}/mycp.zip"
  else
    fail "curl/wget tidak tersedia"
  fi
  unzip -q "${TMP_DIR}/mycp.zip" -d "${TMP_DIR}"
  SRC_DIR="$(find "${TMP_DIR}" -maxdepth 1 -type d -name 'mycp-*' | head -n 1)"
  [ -n "${SRC_DIR}" ] || fail "Gagal mengekstrak archive"
  rsync -a --delete --exclude=".git" --exclude="node_modules" --exclude="data" "${SRC_DIR}/" "${APP_DIR}/"
  rm -rf "${TMP_DIR}"
fi

log "Set script permissions"
find "${APP_DIR}/scripts" -name '*.sh' -exec chmod +x {} +

log "Install dependencies"
if [ -s /root/.nvm/nvm.sh ]; then
  export NVM_DIR="/root/.nvm"
  \. "$NVM_DIR/nvm.sh"
fi
cd "${APP_DIR}"
npm install --production 2>&1 || warn "npm install gagal"
npm rebuild 2>&1 || warn "npm rebuild gagal"

log "Update selesai, restart service..."
