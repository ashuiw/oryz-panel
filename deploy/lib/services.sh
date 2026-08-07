#!/usr/bin/env bash
# systemd unit installation and lifecycle management.

ORYZ_UNITS=(
  oryz-web.service
)
ORYZ_TARGET="oryz.target"

install_services() {
  step "System services"
  local tpl_dir="${ORYZ_TEMPLATE_DIR:-$ORYZ_APP_DIR/deploy/templates}/systemd"
  local unit

  # Remove units from older installer revisions. The TanStack production build
  # emits one server entry; launching nonexistent worker/queue files or a
  # duplicate API process makes an otherwise successful install look broken.
  local legacy_units=(oryz-api.service oryz-worker.service oryz-scheduler.service oryz-queue.service)
  for unit in "${legacy_units[@]}"; do
    systemctl disable --now "$unit" >/dev/null 2>&1 || true
    rm -f "/etc/systemd/system/$unit"
  done

  for unit in "${ORYZ_UNITS[@]}" "$ORYZ_TARGET"; do
    [[ -f "$tpl_dir/$unit" ]] || die "missing unit template: $tpl_dir/$unit"
    sed \
      -e "s|@@USER@@|${ORYZ_USER}|g" \
      -e "s|@@GROUP@@|${ORYZ_GROUP}|g" \
      -e "s|@@APP_DIR@@|${ORYZ_APP_DIR}|g" \
      -e "s|@@ENV_FILE@@|${ORYZ_ENV_FILE}|g" \
      -e "s|@@STATE_DIR@@|${ORYZ_STATE_DIR}|g" \
      -e "s|@@LOG_DIR@@|${ORYZ_LOG_DIR}|g" \
      "$tpl_dir/$unit" >"/etc/systemd/system/$unit"
    chmod 0644 "/etc/systemd/system/$unit"
  done

  systemctl daemon-reload
  systemctl enable "$ORYZ_TARGET" >/dev/null 2>&1
  for unit in "${ORYZ_UNITS[@]}"; do
    systemctl enable "$unit" >/dev/null 2>&1
  done
  check_row "Units" "${#ORYZ_UNITS[@]} services + ${ORYZ_TARGET} registered" ok

  install_logrotate
  services_start
}

install_logrotate() {
  cat >/etc/logrotate.d/oryz <<EOF
${ORYZ_LOG_DIR}/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 0640 ${ORYZ_USER} ${ORYZ_GROUP}
    sharedscripts
    postrotate
        systemctl kill -s HUP ${ORYZ_TARGET} 2>/dev/null || true
    endscript
}
EOF
  chmod 0644 /etc/logrotate.d/oryz
  check_row "Log rotation" "daily, 14 days retained" ok
}

services_start()   { systemctl start "$ORYZ_TARGET"; }
services_stop()    { systemctl stop "$ORYZ_TARGET" 2>/dev/null || true; }
services_restart() {
  local unit
  systemctl restart "$ORYZ_TARGET"
  for unit in "${ORYZ_UNITS[@]}"; do systemctl restart "$unit" 2>/dev/null || true; done
}

services_status() {
  local unit state sub
  printf '  %-26s %-10s %s\n' "UNIT" "STATE" "DETAIL"
  for unit in "${ORYZ_UNITS[@]}"; do
    state="$(systemctl is-active "$unit" 2>/dev/null || true)"
    sub="$(systemctl show -p SubState --value "$unit" 2>/dev/null || true)"
    if [[ "$state" == "active" ]]; then
      printf '  %-26s %s%-10s%s %s\n' "$unit" "$C_GREEN" "$state" "$C_RESET" "$sub"
    else
      printf '  %-26s %s%-10s%s %s\n' "$unit" "$C_RED" "${state:-unknown}" "$C_RESET" "$sub"
    fi
  done
}

services_wait_healthy() {
  # services_wait_healthy [timeout-seconds]
  local timeout="${1:-60}" waited=0 unit ok
  while (( waited < timeout )); do
    ok=1
    for unit in "${ORYZ_UNITS[@]}"; do
      service_active "$unit" || ok=0
    done
    (( ok )) && return 0
    sleep 2; waited=$((waited + 2))
  done
  return 1
}

remove_services() {
  local unit
  services_stop
  for unit in "${ORYZ_UNITS[@]}" "$ORYZ_TARGET"; do
    systemctl disable "$unit" >/dev/null 2>&1 || true
    rm -f "/etc/systemd/system/$unit"
  done
  rm -f /etc/logrotate.d/oryz
  systemctl daemon-reload
}
