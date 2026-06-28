#!/usr/bin/env bash
# Auto-detect APP_DIR: jika script dijalankan dari dalam repo panel, gunakan pwd
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -z "${APP_DIR:-}" ]; then
  if [ -f "$(pwd)/server/server.js" ]; then
    APP_DIR="$(pwd)"
  elif [ -f "${SCRIPT_DIR}/server/server.js" ]; then
    APP_DIR="${SCRIPT_DIR}"
  else
    # Coba deteksi dari user home
    for user_home in /home/*; do
      [ -d "${user_home}/mycp" ] && [ -f "${user_home}/mycp/server/server.js" ] && { APP_DIR="${user_home}/mycp"; break; }
    done
  fi
fi
APP_DIR="${APP_DIR:-/opt/mycontrolpanel}"
cd "${APP_DIR}"
exec node server/server.js
