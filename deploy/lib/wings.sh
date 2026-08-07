#!/usr/bin/env bash
# Wings — the Oryz node daemon.
#
# A node is one wings installation. It owns everything about the servers it
# hosts: containers, volumes under its own data directory, its local state
# database and its own scheduler. Nodes never talk to each other, so losing one
# node affects only the servers on that node.
#
# Wings is also independent of the panel at runtime: containers use a
# restart policy of unless-stopped and wings keeps reconciling them from its
# local state. If the panel is down, running servers stay up — only the web UI
# and cross-node operations are unavailable until the panel returns.

WINGS_CONF_DIR="${WINGS_CONF_DIR:-/etc/oryz-wings}"
WINGS_CONF_FILE="${WINGS_CONF_FILE:-$WINGS_CONF_DIR/config.yml}"
WINGS_DATA_DIR_DEFAULT="/var/lib/oryz-wings"
WINGS_UNIT="oryz-wings.service"
WINGS_USER="${WINGS_USER:-oryz-wings}"
WINGS_GROUP="${WINGS_GROUP:-oryz-wings}"

gen_uuid() {
  if [[ -r /proc/sys/kernel/random/uuid ]]; then
    cat /proc/sys/kernel/random/uuid
  else
    local h; h="$(gen_hex 16)"
    printf '%s-%s-%s-%s-%s' "${h:0:8}" "${h:8:4}" "${h:12:4}" "${h:16:4}" "${h:20:12}"
  fi
}

wings_default_memory_mb() {
  local total="${RAM_MB:-0}"
  (( total > 0 )) || total="$(awk '/MemTotal/ {printf "%d", $2/1024}' /proc/meminfo 2>/dev/null || echo 4096)"
  echo $(( total * 80 / 100 ))
}

ensure_wings_account() {
  id -u "$WINGS_USER" >/dev/null 2>&1 && return 0
  groupadd --system "$WINGS_GROUP" 2>/dev/null || true
  useradd --system --gid "$WINGS_GROUP" --home-dir "$WINGS_DATA_DIR" \
    --shell /usr/sbin/nologin --comment "Oryz wings" "$WINGS_USER"
}


collect_wings_config() {
  step "Node (wings) configuration"

  ask WINGS_NODE_NAME "Node name" "${WINGS_NODE_NAME:-$(hostname -s)}"
  ask WINGS_FQDN "Public FQDN or IP of this node" "${WINGS_FQDN:-${PANEL_DOMAIN:-$(hostname -f 2>/dev/null || hostname)}}"
  ask_choice WINGS_SCHEME "Scheme daemon endpoints use:" "${WINGS_SCHEME:-https}" https http
  ask WINGS_PORT "Daemon API port" "${WINGS_PORT:-8080}"
  require_valid valid_port WINGS_PORT "expected 1-65535"
  ask WINGS_SFTP_PORT "Daemon SFTP port" "${WINGS_SFTP_PORT:-2022}"
  require_valid valid_port WINGS_SFTP_PORT "expected 1-65535"
  ask WINGS_DATA_DIR "Server data directory (per-node, holds every server volume)" \
    "${WINGS_DATA_DIR:-$WINGS_DATA_DIR_DEFAULT}"

  # Where this node reports to. On a wings-only host this is another machine's
  # panel — that is the whole point of installing wings on its own.
  if installing_panel; then
    WINGS_PANEL_URL="${WINGS_PANEL_URL:-${PANEL_URL}}"
  else
    ask WINGS_PANEL_URL "Panel URL this node belongs to" "${WINGS_PANEL_URL:-https://panel.example.com}"
  fi

  # Two ways to attach: paste a token issued by the panel, or let the installer
  # mint credentials and print a blob you paste into the panel afterwards.
  if [[ -z "${WINGS_NODE_TOKEN:-}" ]] && is_interactive && ! installing_panel; then
    if confirm "Do you already have a node token from the panel?" n; then
      ask_secret WINGS_NODE_TOKEN "Node token"
    fi
  fi

  if [[ -n "${WINGS_NODE_TOKEN:-}" ]]; then
    WINGS_TOKEN_ID="${WINGS_TOKEN_ID:-${WINGS_NODE_TOKEN:0:16}}"
  else
    WINGS_TOKEN_ID="${WINGS_TOKEN_ID:-$(gen_hex 8)}"
    WINGS_NODE_TOKEN="${WINGS_NODE_TOKEN:-$(gen_secret 48)}"
  fi
  WINGS_NODE_UUID="${WINGS_NODE_UUID:-$(gen_uuid)}"

  ask WINGS_MEMORY_MB "Memory available to servers (MB)" "${WINGS_MEMORY_MB:-$(wings_default_memory_mb)}"
  ask WINGS_DISK_MB "Disk available to servers (MB)" "${WINGS_DISK_MB:-51200}"
}

install_wings() {
  step "Installing wings (node daemon)"

  INSTALL_DOCKER=yes install_docker
  ensure_wings_account

  install -d -m 0750 "$WINGS_CONF_DIR"
  install -d -m 0750 "$WINGS_DATA_DIR"
  install -d -m 0750 "$WINGS_DATA_DIR/volumes"
  install -d -m 0750 "$WINGS_DATA_DIR/backups"
  install -d -m 0750 "$WINGS_DATA_DIR/state"
  install -d -m 0750 /var/log/oryz-wings

  write_wings_config
  install_wings_service

  check_row "Wings" "node ${WINGS_NODE_NAME} configured at ${WINGS_CONF_FILE}" ok
}

write_wings_config() {
  local tpl="${ORYZ_TEMPLATE_DIR:-$ORYZ_APP_DIR/deploy/templates}/wings/config.yml.template"
  [[ -f "$tpl" ]] || die "missing wings template: $tpl"

  if [[ -f "$WINGS_CONF_FILE" ]]; then
    cp -a "$WINGS_CONF_FILE" "${WINGS_CONF_FILE}.$(timestamp).bak"
    chmod 0600 "${WINGS_CONF_FILE}".*.bak
    warn "existing wings configuration backed up"
  fi

  local tmp; tmp="$(mktemp)"; chmod 0600 "$tmp"
  sed \
    -e "s|@@UUID@@|${WINGS_NODE_UUID}|g" \
    -e "s|@@NAME@@|${WINGS_NODE_NAME}|g" \
    -e "s|@@PANEL_URL@@|${WINGS_PANEL_URL%/}|g" \
    -e "s|@@TOKEN_ID@@|${WINGS_TOKEN_ID}|g" \
    -e "s|@@TOKEN@@|${WINGS_NODE_TOKEN}|g" \
    -e "s|@@FQDN@@|${WINGS_FQDN}|g" \
    -e "s|@@SCHEME@@|${WINGS_SCHEME}|g" \
    -e "s|@@PORT@@|${WINGS_PORT}|g" \
    -e "s|@@SFTP_PORT@@|${WINGS_SFTP_PORT}|g" \
    -e "s|@@DATA_DIR@@|${WINGS_DATA_DIR}|g" \
    -e "s|@@MEMORY_MB@@|${WINGS_MEMORY_MB}|g" \
    -e "s|@@DISK_MB@@|${WINGS_DISK_MB}|g" \
    "$tpl" >"$tmp"

  cat "$tmp" >"$WINGS_CONF_FILE"
  rm -f "$tmp"
  chmod 0640 "$WINGS_CONF_FILE"
  chown root:"${WINGS_GROUP}" "$WINGS_CONF_FILE" 2>/dev/null || true
}

install_wings_service() {
  local tpl_dir="${ORYZ_TEMPLATE_DIR:-$ORYZ_APP_DIR/deploy/templates}/systemd"
  [[ -f "$tpl_dir/$WINGS_UNIT" ]] || die "missing unit template: $tpl_dir/$WINGS_UNIT"
  sed \
    -e "s|@@CONF_FILE@@|${WINGS_CONF_FILE}|g" \
    -e "s|@@DATA_DIR@@|${WINGS_DATA_DIR}|g" \
    "$tpl_dir/$WINGS_UNIT" >"/etc/systemd/system/$WINGS_UNIT"
  chmod 0644 "/etc/systemd/system/$WINGS_UNIT"
  systemctl daemon-reload
  systemctl enable "$WINGS_UNIT" >/dev/null 2>&1 || true
  systemctl restart "$WINGS_UNIT" >/dev/null 2>&1 || warn "wings did not start yet — run: journalctl -u $WINGS_UNIT"
}

# A portable, panel-agnostic registration blob. Paste it into Admin → Nodes →
# Add node on ANY Oryz panel; it contains no panel-specific state.
wings_registration_blob() {
  printf '%s' "{\"uuid\":\"${WINGS_NODE_UUID}\",\"name\":\"${WINGS_NODE_NAME}\",\"fqdn\":\"${WINGS_FQDN}\",\"scheme\":\"${WINGS_SCHEME}\",\"port\":${WINGS_PORT},\"sftp_port\":${WINGS_SFTP_PORT},\"token_id\":\"${WINGS_TOKEN_ID}\",\"token\":\"${WINGS_NODE_TOKEN}\",\"memory_mb\":${WINGS_MEMORY_MB},\"disk_mb\":${WINGS_DISK_MB}}" |
    base64 -w0
}

print_wings_completion() {
  cat <<EOF

${C_GREEN}${C_BOLD}  Node "${WINGS_NODE_NAME}" is installed.${C_RESET}

  Endpoint     ${WINGS_SCHEME}://${WINGS_FQDN}:${WINGS_PORT}
  SFTP         ${WINGS_FQDN}:${WINGS_SFTP_PORT}
  Data         ${WINGS_DATA_DIR}   (this node's servers only)
  Config       ${WINGS_CONF_FILE}  (mode 0640, contains the node token)

  Register this node with any Oryz panel — Admin → Nodes → Add node →
  "Paste node configuration", then paste:

$(wings_registration_blob | fold -w 76 | sed 's/^/    /')

  Open ports ${WINGS_PORT} and ${WINGS_SFTP_PORT} plus your game port range to the panel and to players.
  Servers on this node keep running if the panel goes offline.

EOF
}
