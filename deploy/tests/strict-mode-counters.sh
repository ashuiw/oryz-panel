#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"

if grep -R -n -E '\(\([^)]*(\+\+|--)[^)]*\)\)' \
  "$ROOT_DIR/deploy/lib" "$ROOT_DIR/deploy/install.sh" \
  "$ROOT_DIR/deploy/upgrade.sh" "$ROOT_DIR/deploy/panelctl"; then
  printf 'unsafe standalone increment or decrement found in deployment scripts\n' >&2
  exit 1
fi

# Mirror both run_migrations counter branches under the installer's strict mode.
skipped=0
applied=0
((skipped += 1))
((applied += 1))

[[ "$skipped" -eq 1 ]]
[[ "$applied" -eq 1 ]]

printf 'strict-mode deployment counters passed\n'