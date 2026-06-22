#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

printf 'domain\tusername\truntime\troot\tstatus\n'
if [ -d "${MYCP_SITES_DIR}" ]; then
  for file in "${MYCP_SITES_DIR}"/*.env; do
    [ -f "${file}" ] || continue
    # shellcheck disable=SC1090
    source "${file}"
    printf '%s\t%s\t%s\t%s\t%s\n' "${DOMAIN}" "${USERNAME}" "${RUNTIME}" "${ROOT_DIR}" "${STATUS:-running}"
  done
fi
