#!/usr/bin/env bash
# Backup, restore and upgrade primitives.

backup_create() {
  # backup_create [label] -> prints archive path on stdout
  local label="${1:-manual}"
  local stamp; stamp="$(timestamp)"
  local name="oryz-${label}-${stamp}"
  local work; work="$(mktemp -d)"
  chmod 0700 "$work"
  install -d -m 0700 "$ORYZ_BACKUP_DIR"

  # 1. database
  if has_cmd pg_dump; then
    PGPASSWORD="$DB_PASSWORD" pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" \
      -d "$DB_NAME" --no-owner --no-privileges -Fc -f "$work/database.dump"
  else
    warn "pg_dump unavailable — database not included in this backup"
  fi

  # 2. configuration and environment
  install -d "$work/config"
  [[ -f "$ORYZ_ENV_FILE" ]] && cp -a "$ORYZ_ENV_FILE" "$work/config/oryz.env"
  [[ -f /etc/nginx/sites-available/oryz.conf ]] && cp -a /etc/nginx/sites-available/oryz.conf "$work/config/"
  [[ -f /etc/caddy/Caddyfile ]] && cp -a /etc/caddy/Caddyfile "$work/config/"
  cp -a /etc/systemd/system/oryz-*.service "$work/config/" 2>/dev/null || true

  # 3. uploaded assets / local storage
  local storage="${STORAGE_PATH:-$ORYZ_STATE_DIR/storage}"
  if [[ -d "$storage" ]]; then
    tar -C "$storage" -czf "$work/storage.tar.gz" . 2>/dev/null || true
  fi

  # 4. manifest
  cat >"$work/manifest.json" <<EOF
{
  "name": "${name}",
  "label": "${label}",
  "created_at": "$(date -u +%FT%TZ)",
  "panel_version": "$(cat "$ORYZ_HOME/VERSION" 2>/dev/null || echo unknown)",
  "database": "${DB_NAME}",
  "storage_driver": "${STORAGE_DRIVER:-local}",
  "host": "$(hostname -f 2>/dev/null || hostname)"
}
EOF

  local archive="$ORYZ_BACKUP_DIR/${name}.tar.gz"
  tar -C "$work" -czf "$archive" .
  chmod 0600 "$archive"
  sha256sum "$archive" | cut -d' ' -f1 >"${archive}.sha256"
  chmod 0600 "${archive}.sha256"
  rm -rf "$work"
  printf '%s\n' "$archive"
}

backup_list() {
  install -d -m 0700 "$ORYZ_BACKUP_DIR"
  local f found=0
  printf '  %-46s %10s  %s\n' "ARCHIVE" "SIZE" "CREATED"
  for f in "$ORYZ_BACKUP_DIR"/oryz-*.tar.gz; do
    [[ -e "$f" ]] || continue
    found=1
    printf '  %-46s %10s  %s\n' "$(basename "$f")" \
      "$(du -h "$f" | cut -f1)" "$(date -r "$f" '+%Y-%m-%d %H:%M')"
  done
  (( found )) || dim "  no backups yet"
}

backup_prune() {
  local keep="${1:-10}" f count=0
  while IFS= read -r f; do
    ((count += 1))
    if (( count > keep )); then rm -f "$f" "${f}.sha256"; log "pruned $(basename "$f")"; fi
  done < <(ls -1t "$ORYZ_BACKUP_DIR"/oryz-*.tar.gz 2>/dev/null || true)
}

backup_verify() {
  local archive="$1"
  [[ -f "$archive" ]] || die "backup not found: $archive"
  if [[ -f "${archive}.sha256" ]]; then
    local expected actual
    expected="$(cat "${archive}.sha256")"
    actual="$(sha256sum "$archive" | cut -d' ' -f1)"
    [[ "$expected" == "$actual" ]] || die "checksum mismatch — $archive is corrupt"
  fi
  tar -tzf "$archive" >/dev/null 2>&1 || die "$archive is not a readable archive"
}

backup_restore() {
  local archive="$1"
  [[ "$archive" == /* ]] || archive="$ORYZ_BACKUP_DIR/$archive"
  backup_verify "$archive"

  step "Restoring from $(basename "$archive")"
  local work; work="$(mktemp -d)"; chmod 0700 "$work"
  tar -C "$work" -xzf "$archive"

  [[ -f "$work/manifest.json" ]] && cat "$work/manifest.json"

  confirm "This overwrites the current database and configuration. Continue?" n ||
    { rm -rf "$work"; die "restore cancelled"; }

  services_stop

  if [[ -f "$work/config/oryz.env" ]]; then
    cp -a "$ORYZ_ENV_FILE" "${ORYZ_ENV_FILE}.pre-restore.$(timestamp)" 2>/dev/null || true
    cp -a "$work/config/oryz.env" "$ORYZ_ENV_FILE"
    secure_env_file "$ORYZ_ENV_FILE"
    env_load "$ORYZ_ENV_FILE"
    check_row "Configuration" "restored" ok
  fi

  if [[ -f "$work/database.dump" ]]; then
    PGPASSWORD="$DB_PASSWORD" pg_restore -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" \
      -d "$DB_NAME" --clean --if-exists --no-owner --no-privileges "$work/database.dump" >/dev/null 2>&1 ||
      warn "pg_restore reported non-fatal errors — review the output above"
    check_row "Database" "restored" ok
  fi

  if [[ -f "$work/storage.tar.gz" ]]; then
    local storage="${STORAGE_PATH:-$ORYZ_STATE_DIR/storage}"
    install -d -o "$ORYZ_USER" -g "$ORYZ_GROUP" -m 0750 "$storage"
    tar -C "$storage" -xzf "$work/storage.tar.gz"
    chown -R "$ORYZ_USER:$ORYZ_GROUP" "$storage"
    check_row "Storage" "restored" ok
  fi

  rm -rf "$work"
  services_start
  success "restore complete"
}
