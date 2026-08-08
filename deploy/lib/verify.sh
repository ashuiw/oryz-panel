#!/usr/bin/env bash
# Post-install verification and the `panelctl doctor` health check engine.

DOCTOR_FAILURES=0
DOCTOR_WARNINGS=0

_dx() {
  # _dx label state detail [remedy]
  local label="$1" state="$2" detail="$3" remedy="${4:-}"
  check_row "$label" "$detail" "$state"
  [[ "$state" == "fail" ]] && { ((DOCTOR_FAILURES += 1)); [[ -n "$remedy" ]] && printf '        %s→ %s%s\n' "$C_DIM" "$remedy" "$C_RESET"; }
  [[ "$state" == "warn" ]] && { ((DOCTOR_WARNINGS += 1)); [[ -n "$remedy" ]] && printf '        %s→ %s%s\n' "$C_DIM" "$remedy" "$C_RESET"; }
  return 0
}

check_config() {
  step "Configuration"
  if [[ -f "$ORYZ_ENV_FILE" ]]; then
    local perms; perms="$(stat -c '%a %U:%G' "$ORYZ_ENV_FILE")"
    if [[ "${perms%% *}" =~ ^0?6[04]0$ ]]; then
      _dx "Config file" ok "$ORYZ_ENV_FILE ($perms)"
    else
      _dx "Config file" warn "$ORYZ_ENV_FILE has permissions $perms" "chmod 0640 $ORYZ_ENV_FILE"
    fi
    local key missing=()
    for key in APP_URL DATABASE_URL REDIS_URL JWT_SECRET SESSION_SECRET ENCRYPTION_KEY; do
      [[ -n "$(env_get "$key" || true)" ]] || missing+=("$key")
    done
    if ((${#missing[@]})); then
      _dx "Required keys" fail "missing: ${missing[*]}" "run: panelctl config repair"
    else
      _dx "Required keys" ok "all present"
    fi
  else
    _dx "Config file" fail "not found at $ORYZ_ENV_FILE" "run: panelctl install"
  fi
}

check_database() {
  step "Database"
  if ! has_cmd psql; then
    _dx "psql client" warn "not installed" "apt-get install postgresql-client"; return
  fi
  if PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc 'SELECT 1' >/dev/null 2>&1; then
    local version count
    version="$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc 'SHOW server_version' 2>/dev/null)"
    _dx "Connection" ok "PostgreSQL ${version} at ${DB_HOST}:${DB_PORT}"
    count="$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc 'SELECT count(*) FROM schema_migrations' 2>/dev/null || echo 0)"
    if [[ "${count:-0}" -gt 0 ]]; then
      _dx "Migrations" ok "${count} applied"
    else
      _dx "Migrations" fail "no migrations recorded" "run: panelctl update --migrate-only"
    fi
  else
    _dx "Connection" fail "cannot reach ${DB_HOST}:${DB_PORT}/${DB_NAME}" "check credentials in $ORYZ_ENV_FILE and 'systemctl status postgresql'"
  fi
}

check_redis() {
  step "Redis"
  if ! has_cmd redis-cli; then
    _dx "redis-cli" warn "not installed — cannot probe" "apt-get install redis-tools"; return
  fi
  local out
  if [[ -n "${REDIS_PASSWORD:-}" ]]; then
    out="$(REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping 2>/dev/null || true)"
  else
    out="$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping 2>/dev/null || true)"
  fi
  if [[ "$out" == "PONG" ]]; then
    _dx "Connection" ok "${REDIS_HOST}:${REDIS_PORT} responding"
  else
    _dx "Connection" fail "no response from ${REDIS_HOST}:${REDIS_PORT}" "systemctl status redis-server; verify REDIS_PASSWORD"
  fi
}

check_services() {
  step "Services"
  local unit state
  for unit in "${ORYZ_UNITS[@]}"; do
    state="$(systemctl is-active "$unit" 2>/dev/null || echo inactive)"
    if [[ "$state" == "active" ]]; then
      _dx "$unit" ok "active"
    else
      _dx "$unit" fail "$state" "journalctl -u $unit -n 50"
    fi
  done
}

check_http() {
  step "HTTP and WebSocket"
  local code
  code="$(curl -fsS -o /dev/null -w '%{http_code}' --max-time 10 "http://127.0.0.1:${APP_PORT}/" 2>/dev/null || echo 000)"
  if [[ "$code" =~ ^(200|204|301|302|307|308)$ ]]; then
    _dx "Panel" ok "application returned $code"
  else
    _dx "Panel" fail "application returned $code" "journalctl -u oryz-web -n 50"
  fi

  if [[ "${SSL_MODE}" != "none" ]]; then
    code="$(curl -fsS -o /dev/null -w '%{http_code}' --max-time 15 "https://${APP_DOMAIN}/" 2>/dev/null || echo 000)"
    if [[ "$code" =~ ^(200|301|302|307|308)$ ]]; then
      _dx "Public URL" ok "https://${APP_DOMAIN} → $code"
    else
      _dx "Public URL" warn "https://${APP_DOMAIN} returned $code" "check DNS, firewall and the reverse proxy"
    fi
  fi
}

check_storage() {
  step "Storage and disk"
  local path="${STORAGE_PATH:-$ORYZ_STATE_DIR/storage}"
  if [[ -d "$path" ]]; then
    if runuser -u "$ORYZ_USER" -- test -w "$path"; then
      _dx "Storage path" ok "$path writable by ${ORYZ_USER}"
    else
      _dx "Storage path" fail "$path not writable by ${ORYZ_USER}" "chown -R ${ORYZ_USER}:${ORYZ_GROUP} $path"
    fi
  elif [[ "${STORAGE_DRIVER}" == "s3" ]]; then
    _dx "Storage driver" ok "s3 bucket ${S3_BUCKET} at ${S3_ENDPOINT}"
  else
    _dx "Storage path" fail "$path is missing" "mkdir -p $path && chown ${ORYZ_USER}:${ORYZ_GROUP} $path"
  fi

  local pct; pct="$(df -P "$ORYZ_HOME" | awk 'NR==2 {gsub("%","",$5); print $5}')"
  if (( pct < 80 )); then _dx "Disk usage" ok "${pct}% used"
  elif (( pct < 90 )); then _dx "Disk usage" warn "${pct}% used" "prune old backups: panelctl backup --prune"
  else _dx "Disk usage" fail "${pct}% used" "free space immediately — the panel will fail to write backups and logs"; fi
}

check_ssl() {
  [[ "${SSL_MODE}" == "none" ]] && return 0
  step "TLS"
  local cert="${SSL_CERT_PATH:-}"
  if [[ -f "$cert" ]]; then
    local end days
    end="$(openssl x509 -in "$cert" -noout -enddate | cut -d= -f2)"
    days=$(( ( $(date -d "$end" +%s) - $(date +%s) ) / 86400 ))
    if (( days > 21 )); then _dx "Certificate" ok "valid for ${days} more days"
    elif (( days > 0 )); then _dx "Certificate" warn "expires in ${days} days" "panelctl ssl renew"
    else _dx "Certificate" fail "expired" "panelctl ssl renew"; fi
  else
    _dx "Certificate" fail "not found at ${cert:-<unset>}" "panelctl ssl renew"
  fi
  if systemctl is-enabled --quiet certbot.timer 2>/dev/null; then
    _dx "Auto-renewal" ok "certbot.timer enabled"
  elif [[ "${SSL_MODE}" == "letsencrypt" ]]; then
    _dx "Auto-renewal" warn "certbot.timer not enabled" "systemctl enable --now certbot.timer"
  fi
}

check_ports() {
  step "Ports"
  local p
  for p in "$APP_PORT"; do
    if port_in_use "$p"; then _dx "Port $p" ok "bound by the panel"
    else _dx "Port $p" fail "nothing listening" "systemctl status oryz-web"; fi
  done
  if [[ "${PROXY_KIND}" != "none" ]]; then
    for p in 80 443; do
      if port_in_use "$p"; then _dx "Port $p" ok "reverse proxy listening"
      else _dx "Port $p" warn "not bound" "systemctl status ${PROXY_KIND}"; fi
    done
  fi
}

check_permissions() {
  step "Permissions"
  local owner; owner="$(stat -c '%U:%G' "$ORYZ_APP_DIR" 2>/dev/null || echo '?')"
  if [[ "$owner" == "${ORYZ_USER}:${ORYZ_GROUP}" ]]; then
    _dx "App directory" ok "$ORYZ_APP_DIR owned by $owner"
  else
    _dx "App directory" fail "owned by $owner" "chown -R ${ORYZ_USER}:${ORYZ_GROUP} $ORYZ_APP_DIR"
  fi
  if runuser -u "$ORYZ_USER" -- test -r "$ORYZ_APP_DIR/package.json" &&
     runuser -u "$ORYZ_USER" -- test -r "$ORYZ_ENV_FILE"; then
    _dx "Runtime access" ok "service account can read application and configuration"
  else
    _dx "Runtime access" fail "service account cannot read required files" "run: panelctl permissions:repair"
  fi
  if [[ "$(stat -c '%a' "$ORYZ_BACKUP_DIR" 2>/dev/null)" == "700" ]]; then
    _dx "Backup directory" ok "0700"
  else
    _dx "Backup directory" warn "expected mode 0700" "chmod 0700 $ORYZ_BACKUP_DIR"
  fi
  if id -u "$ORYZ_USER" >/dev/null 2>&1; then
    local shell; shell="$(getent passwd "$ORYZ_USER" | cut -d: -f7)"
    if [[ "$shell" == *nologin || "$shell" == *false ]]; then
      _dx "Service account" ok "${ORYZ_USER} (non-login)"
    else
      _dx "Service account" warn "${ORYZ_USER} has a login shell ($shell)" "usermod -s /usr/sbin/nologin ${ORYZ_USER}"
    fi
  else
    _dx "Service account" fail "${ORYZ_USER} does not exist" "panelctl install"
  fi
}

run_doctor() {
  DOCTOR_FAILURES=0; DOCTOR_WARNINGS=0
  env_load "$ORYZ_ENV_FILE" 2>/dev/null || true
  check_config
  check_database
  check_redis
  check_services
  check_http
  check_storage
  check_ssl
  check_ports
  check_permissions

  printf '\n'
  if (( DOCTOR_FAILURES == 0 && DOCTOR_WARNINGS == 0 )); then
    success "all checks passed — the panel is healthy"
  elif (( DOCTOR_FAILURES == 0 )); then
    warn "$DOCTOR_WARNINGS warning(s), no failures"
  else
    error "$DOCTOR_FAILURES failure(s) and $DOCTOR_WARNINGS warning(s)"
  fi
  return $(( DOCTOR_FAILURES > 0 ? 1 : 0 ))
}

verify_installation() {
  step "Verifying installation"
  if services_wait_healthy 90; then
    check_row "Services" "all units active" ok
  else
    services_status
    die "services did not become healthy — inspect: journalctl -u oryz-web -n 80"
  fi
  DOCTOR_FAILURES=0; DOCTOR_WARNINGS=0
  check_database; check_redis; check_http; check_storage
  (( DOCTOR_FAILURES == 0 )) || die "post-install verification failed — run 'panelctl doctor' for details"
  success "installation verified"
}
