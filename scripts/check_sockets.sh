#!/usr/bin/env bash
NGINX_DIR="${MYCP_NGINX_DIR:-/etc/nginx}"
for f in "${NGINX_DIR}/sites-enabled/mycp-"*; do
  d=$(basename "$f")
  s=$(grep fastcgi_pass "$f" 2>/dev/null | head -1 | grep -oP 'unix:\K[^;]+')
  if [ -n "$s" ] && [ ! -S "$s" ]; then
    echo "MISSING: $d -> $s"
  fi
done
