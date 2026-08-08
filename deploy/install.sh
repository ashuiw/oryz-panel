#!/usr/bin/env bash
#
# Oryz Panel installer
#
#   Interactive:      sudo ./install.sh
#   Unattended:       sudo ./install.sh --non-interactive --config /path/to/answers.env
#   One-liner:        curl -fsSL https://install.oryz.example/install.sh | sudo bash -s -- --non-interactive
#
# Every prompt has a matching environment variable, so any interactive run can
# be reproduced unattended. See deploy/answers.example.env.

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="$SCRIPT_DIR/lib"

# When piped from curl the libraries are not on disk yet — fetch the bundle.
if [[ ! -d "$LIB_DIR" ]]; then
  BOOTSTRAP_DIR="$(mktemp -d)"
  curl -fsSL "${ORYZ_INSTALLER_BUNDLE:-https://github.com/oryz-panel/oryz/archive/refs/heads/main.tar.gz}" |
    tar -xz -C "$BOOTSTRAP_DIR" --strip-components=1
  SCRIPT_DIR="$BOOTSTRAP_DIR/deploy"
  LIB_DIR="$SCRIPT_DIR/lib"
  ORYZ_SOURCE_DIR="${ORYZ_SOURCE_DIR:-$BOOTSTRAP_DIR}"
fi

# shellcheck source=lib/common.sh
source "$LIB_DIR/common.sh"
source "$LIB_DIR/preflight.sh"
source "$LIB_DIR/components.sh"
source "$LIB_DIR/deps.sh"
source "$LIB_DIR/config.sh"
source "$LIB_DIR/integrations.sh"
source "$LIB_DIR/wings.sh"
source "$LIB_DIR/database.sh"
source "$LIB_DIR/build.sh"
source "$LIB_DIR/proxy.sh"
source "$LIB_DIR/ssl.sh"
source "$LIB_DIR/services.sh"
source "$LIB_DIR/verify.sh"

ORYZ_TEMPLATE_DIR="$SCRIPT_DIR/templates"

usage() {
  cat <<EOF
${ORYZ_NAME} installer

Usage: install.sh [options]

      --components KIND     panel+wings | panel | wings      (default panel+wings)
      --wings-panel URL     Panel this node registers with (wings-only installs)
      --node-name NAME      Node name for the wings install
      --node-token TOKEN    Node token issued by the panel (wings-only installs)
  -y, --non-interactive     Never prompt; every required value must come from
                            --config, environment variables or defaults.
  -c, --config FILE         Load answers from a KEY=VALUE file before starting.
      --domain FQDN         Panel domain.
      --admin-email EMAIL   Administrator email.
      --proxy KIND          nginx | caddy | traefik | none      (default nginx)
      --ssl MODE            letsencrypt | existing | selfsigned | none
      --db-mode MODE        local | remote                      (default local)
      --redis-mode MODE     local | remote                      (default local)
      --storage DRIVER      local | s3                          (default local)
      --with-docker         Install the Docker engine for daemon nodes.
      --skip-build          Reuse an existing build (upgrade flows).
      --source DIR          Install from a local source tree instead of a release.
      --assume-yes          Answer yes to destructive confirmations.
      --force-os            Continue on an unsupported distribution.
  -h, --help                Show this message.

Documentation: docs/deployment/installation.md
EOF
}

parse_args() {
  while (( $# )); do
    case "$1" in
      -y|--non-interactive) ORYZ_NON_INTERACTIVE=1 ;;
      --components) INSTALL_COMPONENTS="$2"; shift ;;
      --wings-panel) WINGS_PANEL_URL="$2"; shift ;;
      --node-name) WINGS_NODE_NAME="$2"; shift ;;
      --node-token) WINGS_NODE_TOKEN="$2"; shift ;;
      -c|--config) ANSWERS_FILE="$2"; shift ;;
      --domain) PANEL_DOMAIN="$2"; shift ;;
      --admin-email) ADMIN_EMAIL="$2"; shift ;;
      --proxy) PROXY_KIND="$2"; shift ;;
      --ssl) SSL_MODE="$2"; shift ;;
      --db-mode) DB_MODE="$2"; shift ;;
      --redis-mode) REDIS_MODE="$2"; shift ;;
      --storage) STORAGE_DRIVER="$2"; shift ;;
      --with-docker) INSTALL_DOCKER=yes ;;
      --skip-build) SKIP_BUILD=1 ;;
      --source) ORYZ_SOURCE_DIR="$2"; shift ;;
      --assume-yes) ORYZ_ASSUME_YES=1 ;;
      --force-os) ORYZ_FORCE_OS=1 ;;
      -h|--help) usage; exit 0 ;;
      *) usage; die "unknown option: $1" ;;
    esac
    shift
  done
}

load_answers() {
  [[ -n "${ANSWERS_FILE:-}" ]] || return 0
  [[ -f "$ANSWERS_FILE" ]] || die "answers file not found: $ANSWERS_FILE"
  local perms; perms="$(stat -c '%a' "$ANSWERS_FILE")"
  [[ "$perms" =~ ^0?[64]00$ ]] || warn "$ANSWERS_FILE is mode $perms — it may contain secrets, prefer 0600"
  env_load "$ANSWERS_FILE"
  info "loaded answers from $ANSWERS_FILE"
}

print_summary() {
  step "Review"
  printf '  %-22s %s\n' "Components"     "${INSTALL_COMPONENTS}"
  if installing_wings; then
    printf '  %-22s %s\n' "Node"          "${WINGS_NODE_NAME} · ${WINGS_SCHEME}://${WINGS_FQDN}:${WINGS_PORT}"
    printf '  %-22s %s\n' "Node data"     "${WINGS_DATA_DIR}"
    printf '  %-22s %s\n' "Reports to"    "${WINGS_PANEL_URL}"
  fi
  if ! installing_panel; then
    printf '\n'
    confirm "Proceed with installation?" y || die "installation cancelled"
    return 0
  fi
  printf '  %-22s %s\n' "Panel URL"      "$PANEL_URL"
  printf '  %-22s %s\n' "Install path"   "$ORYZ_APP_DIR"
  printf '  %-22s %s\n' "Service user"   "$ORYZ_USER"
  printf '  %-22s %s\n' "Database"       "${DB_MODE} · ${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
  printf '  %-22s %s\n' "Redis"          "${REDIS_MODE} · ${REDIS_HOST}:${REDIS_PORT}"
  printf '  %-22s %s\n' "Storage"        "${STORAGE_DRIVER}"
  printf '  %-22s %s\n' "Reverse proxy"  "${PROXY_KIND}"
  printf '  %-22s %s\n' "TLS"            "${SSL_MODE}"
  printf '  %-22s %s\n' "Email"          "$([[ "${SMTP_ENABLED}" == "true" ]] && echo "${SMTP_HOST}:${SMTP_PORT}" || echo disabled)"
  printf '  %-22s %s\n' "Administrator"  "${ADMIN_EMAIL}"
  printf '\n'
  confirm "Proceed with installation?" y || die "installation cancelled"
}

print_completion() {
  local pw_note=""
  [[ "${ADMIN_PASSWORD_GENERATED:-0}" == "1" ]] &&
    pw_note="  A password was generated for the administrator. Retrieve it once with:
    sudo panelctl config get-admin-password"

  cat <<EOF

${C_GREEN}${C_BOLD}  ${ORYZ_NAME} is installed.${C_RESET}

  Dashboard   ${C_BOLD}${PANEL_URL}${C_RESET}
  Sign in as  ${ADMIN_EMAIL}
${pw_note}

  Useful commands
    panelctl status        service overview
    panelctl doctor        full health check with remedies
    panelctl logs -f       follow panel logs
    panelctl update        upgrade to the latest release
    panelctl backup        create a full backup

  Configuration  ${ORYZ_ENV_FILE}   (mode 0640, contains secrets)
  Install log    ${ORYZ_LOG_FILE}

EOF
}

main() {
  parse_args "$@"
  require_root
  install -d -m 0750 "$ORYZ_LOG_DIR"
  enable_error_trap
  banner
  load_answers

  run_preflight

  step "Welcome"
  cat <<EOF
  This installer configures ${ORYZ_NAME} on ${OS_PRETTY}.

  The panel is the web application; wings is the node daemon that runs game
  containers. They can live on the same machine or on separate ones — a
  wings-only host attaches to any panel you like.

  Nothing is written until you confirm the review screen.
EOF
  is_interactive && confirm "Continue?" y || true

  collect_components

  if installing_panel; then
    collect_domain_config
    collect_database_config
    collect_redis_config
    collect_storage_config
    collect_smtp_config
    collect_auth_config
    collect_integration_keys
    collect_admin_config
  fi
  installing_wings && collect_wings_config

  print_summary

  install_all_dependencies

  if installing_panel; then
    create_service_account
    generate_secrets
    fetch_release
    write_env_file
    env_load "$ORYZ_ENV_FILE"

    [[ "${DB_MODE}" == "local" ]] && provision_local_database
    verify_database_connection
    [[ "${SKIP_BUILD:-0}" == "1" ]] || build_application
    bootstrap_auth_schema
    run_migrations
    seed_initial_data
    create_admin_account

    configure_reverse_proxy
    configure_ssl
    [[ "${PROXY_KIND}" == "nginx" ]] && configure_reverse_proxy  # re-render with TLS paths

    install_services

    # The CLI is installed last so a failed run never leaves a half-working tool.
    install -m 0755 "$SCRIPT_DIR/panelctl" /usr/local/bin/panelctl
    check_row "CLI" "/usr/local/bin/panelctl installed" ok

    env_set SETUP_COMPLETE true
  fi

  if installing_wings; then
    install_wings
    installing_panel && env_set WINGS_NODE_UUID "$WINGS_NODE_UUID"
  fi

  installing_panel && verify_installation
  installing_panel && print_completion
  installing_wings && print_wings_completion
  return 0
}

main "$@"
