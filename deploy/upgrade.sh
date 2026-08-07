#!/usr/bin/env bash
#
# Oryz Panel upgrade — invoked by `panelctl update`.
#
# Order of operations is chosen so that any failure before the service restart
# leaves the running installation untouched, and any failure after it triggers
# an automatic rollback to the pre-upgrade backup.

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="$SCRIPT_DIR/lib"

source "$LIB_DIR/common.sh"
source "$LIB_DIR/preflight.sh"
source "$LIB_DIR/services.sh"
source "$LIB_DIR/backup.sh"
source "$LIB_DIR/database.sh"
source "$LIB_DIR/build.sh"
source "$LIB_DIR/verify.sh"

CHECK_ONLY=0
FORCE=0
MIGRATE_ONLY=0

while (( $# )); do
  case "$1" in
    --check) CHECK_ONLY=1 ;;
    --force) FORCE=1 ;;
    --migrate-only) MIGRATE_ONLY=1 ;;
    -y|--assume-yes) ORYZ_ASSUME_YES=1 ;;
    -h|--help) echo "usage: panelctl update [--check] [--migrate-only] [--force] [-y]"; exit 0 ;;
    *) die "unknown option: $1" ;;
  esac
  shift
done

require_root
enable_error_trap
detect_os
env_load "$ORYZ_ENV_FILE" || die "no configuration found — is the panel installed?"

CURRENT_VERSION="$(cat "$ORYZ_HOME/VERSION" 2>/dev/null || echo unknown)"
ROLLBACK_ARCHIVE=""
SNAPSHOT_DIR=""

latest_version() {
  curl -fsSL --max-time 15 "${ORYZ_UPDATE_MANIFEST:-https://releases.oryz.example/latest.json}" 2>/dev/null |
    sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | awk 'NR==1'
}

rollback() {
  error "upgrade failed — rolling back"
  services_stop
  if [[ -n "$SNAPSHOT_DIR" && -d "$SNAPSHOT_DIR" ]]; then
    rm -rf "$ORYZ_APP_DIR"
    mv "$SNAPSHOT_DIR" "$ORYZ_APP_DIR"
    chown -R "$ORYZ_USER:$ORYZ_GROUP" "$ORYZ_APP_DIR"
    log "application files restored"
  fi
  if [[ -n "$ROLLBACK_ARCHIVE" && -f "$ROLLBACK_ARCHIVE" ]]; then
    ORYZ_ASSUME_YES=1 ORYZ_NON_INTERACTIVE=1 backup_restore "$ROLLBACK_ARCHIVE" || true
  fi
  services_start || true
  error "rolled back to ${CURRENT_VERSION}. Backup retained at ${ROLLBACK_ARCHIVE:-<none>}"
  exit 1
}

banner
step "Upgrade"
printf '  %-18s %s\n' "Installed" "$CURRENT_VERSION"

LATEST="$(latest_version || true)"
printf '  %-18s %s\n' "Latest" "${LATEST:-unknown}"

if (( CHECK_ONLY )); then
  if [[ -n "$LATEST" && "$LATEST" != "$CURRENT_VERSION" ]]; then
    success "an update is available: ${CURRENT_VERSION} → ${LATEST}"
  else
    success "the panel is up to date"
  fi
  exit 0
fi

if (( MIGRATE_ONLY )); then
  run_migrations
  services_restart
  success "migrations applied"
  exit 0
fi

if [[ -n "$LATEST" && "$LATEST" == "$CURRENT_VERSION" && $FORCE -eq 0 ]]; then
  success "already running the latest version (use --force to reinstall it)"
  exit 0
fi

confirm "Upgrade ${CURRENT_VERSION} → ${LATEST:-latest}?" y || die "upgrade cancelled"

# 1. Full backup (database, configuration, storage) before touching anything.
step "Pre-upgrade backup"
ROLLBACK_ARCHIVE="$(backup_create pre-upgrade)"
success "backup at $ROLLBACK_ARCHIVE"

# 2. Snapshot the current application tree for instant file rollback.
SNAPSHOT_DIR="${ORYZ_HOME}/releases/rollback-$(timestamp)"
cp -a "$ORYZ_APP_DIR" "$SNAPSHOT_DIR"
check_row "Snapshot" "$SNAPSHOT_DIR" ok

trap rollback ERR

# 3. Fetch, build, migrate, restart.
step "Stopping services"
services_stop
check_row "Services" "stopped" ok

ORYZ_REFETCH=1 fetch_release
build_application
run_migrations
seed_initial_data

step "Starting services"
systemctl daemon-reload
services_start
services_wait_healthy 90 || rollback

verify_installation

trap - ERR
backup_prune "${ORYZ_KEEP_BACKUPS:-10}"
rm -rf "$SNAPSHOT_DIR"

NEW_VERSION="$(cat "$ORYZ_HOME/VERSION" 2>/dev/null || echo unknown)"
printf '\n'
success "upgraded ${CURRENT_VERSION} → ${NEW_VERSION}"
dim "  rollback backup retained at ${ROLLBACK_ARCHIVE}"
