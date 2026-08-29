#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [[ "${1:-}" == "--wipe" ]]; then
  exec node ./scripts/uninstall-app.mjs --remove-app-dir --confirm=UNINSTALL
fi
exec node ./scripts/uninstall-app.mjs "$@"
