#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

printf 'MyControlPanel services\n'
for svc in nginx php*-fpm mariadb mysql postgresql vsftpd; do
  if service ${svc} status >/dev/null 2>&1; then
    printf '%-18s running\n' "${svc}"
  fi
done

printf '\nSites\n'
if [ -d "${MYCP_SITES_DIR}" ]; then
  for file in "${MYCP_SITES_DIR}"/*.env; do
    [ -f "${file}" ] || continue
    # shellcheck disable=SC1090
    source "${file}"
    printf '%-28s %-14s %s\n' "${DOMAIN}" "${USERNAME}" "${STATUS:-running}"
  done
fi
