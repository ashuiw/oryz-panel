#!/usr/bin/env bash
# Interactive/non-interactive configuration gathering and .env generation.

collect_domain_config() {
  step "Domain and networking"
  ask PANEL_DOMAIN "Panel domain (FQDN)" "${PANEL_DOMAIN:-}"
  require_valid valid_domain PANEL_DOMAIN "expected something like panel.example.com"
  ask APP_PORT "Internal HTTP port for the panel" "${APP_PORT:-3000}"
  require_valid valid_port APP_PORT "expected 1-65535"
  ask WS_PORT "Internal WebSocket port" "${WS_PORT:-3001}"
  require_valid valid_port WS_PORT "expected 1-65535"
  ask_choice PROXY_KIND "Reverse proxy to configure:" "${PROXY_KIND:-nginx}" nginx caddy traefik none
  ask_choice SSL_MODE "TLS certificate source:" "${SSL_MODE:-letsencrypt}" letsencrypt existing selfsigned none
  if [[ "$SSL_MODE" == "letsencrypt" ]]; then
    ask SSL_EMAIL "Email for Let's Encrypt notices" "${SSL_EMAIL:-${ADMIN_EMAIL:-}}"
    require_valid valid_email SSL_EMAIL "expected a valid address"
  fi
  if [[ "$SSL_MODE" == "existing" ]]; then
    ask SSL_CERT_PATH "Path to fullchain certificate" "${SSL_CERT_PATH:-}"
    ask SSL_KEY_PATH "Path to private key" "${SSL_KEY_PATH:-}"
  fi
  if [[ "$SSL_MODE" == "selfsigned" ]]; then
    warn "self-signed certificates are for development only — browsers will warn on every visit"
  fi
  PANEL_SCHEME="https"; [[ "$SSL_MODE" == "none" ]] && PANEL_SCHEME="http"
  PANEL_URL="${PANEL_SCHEME}://${PANEL_DOMAIN}"
}

collect_database_config() {
  step "PostgreSQL configuration"
  ask_choice DB_MODE "Database location:" "${DB_MODE:-local}" local remote
  if [[ "$DB_MODE" == "local" ]]; then
    DB_HOST="${DB_HOST:-127.0.0.1}"; DB_PORT="${DB_PORT:-5432}"
  else
    ask DB_HOST "PostgreSQL host" "${DB_HOST:-}"
    ask DB_PORT "PostgreSQL port" "${DB_PORT:-5432}"
  fi
  require_valid valid_port DB_PORT "expected 1-65535"
  ask DB_NAME "Database name" "${DB_NAME:-oryz}"
  require_valid valid_ident DB_NAME "letters, digits and underscores only"
  ask DB_USER "Database user" "${DB_USER:-oryz}"
  require_valid valid_ident DB_USER "letters, digits and underscores only"
  if [[ -z "${DB_PASSWORD:-}" ]]; then
    if [[ "$DB_MODE" == "local" ]]; then
      DB_PASSWORD="$(gen_password 32)"
      log "generated a random database password (stored only in $ORYZ_ENV_FILE)"
    else
      ask_secret DB_PASSWORD "Password for ${DB_USER}@${DB_HOST}"
    fi
  fi
  DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=${DB_SSLMODE:-prefer}"
}

collect_redis_config() {
  step "Redis configuration"
  ask_choice REDIS_MODE "Redis location:" "${REDIS_MODE:-local}" local remote
  if [[ "$REDIS_MODE" == "local" ]]; then
    REDIS_HOST="${REDIS_HOST:-127.0.0.1}"; REDIS_PORT="${REDIS_PORT:-6379}"
    REDIS_PASSWORD="${REDIS_PASSWORD:-$(gen_password 32)}"
  else
    ask REDIS_HOST "Redis host" "${REDIS_HOST:-}"
    ask REDIS_PORT "Redis port" "${REDIS_PORT:-6379}"
    [[ -n "${REDIS_PASSWORD:-}" ]] || confirm "Does this Redis require a password?" y &&
      ask_secret REDIS_PASSWORD "Redis password"
  fi
  require_valid valid_port REDIS_PORT "expected 1-65535"
  REDIS_DB="${REDIS_DB:-0}"
  if [[ -n "${REDIS_PASSWORD:-}" ]]; then
    REDIS_URL="redis://:${REDIS_PASSWORD}@${REDIS_HOST}:${REDIS_PORT}/${REDIS_DB}"
  else
    REDIS_URL="redis://${REDIS_HOST}:${REDIS_PORT}/${REDIS_DB}"
  fi
}

collect_storage_config() {
  step "Storage configuration"
  ask_choice STORAGE_DRIVER "Where should backups and uploads live?" "${STORAGE_DRIVER:-local}" local s3
  if [[ "$STORAGE_DRIVER" == "local" ]]; then
    ask STORAGE_PATH "Local storage path" "${STORAGE_PATH:-$ORYZ_STATE_DIR/storage}"
  else
    ask S3_ENDPOINT "S3 endpoint URL" "${S3_ENDPOINT:-https://s3.amazonaws.com}"
    ask S3_REGION "S3 region" "${S3_REGION:-us-east-1}"
    ask S3_BUCKET "S3 bucket" "${S3_BUCKET:-}"
    ask S3_ACCESS_KEY_ID "S3 access key id" "${S3_ACCESS_KEY_ID:-}"
    ask_secret S3_SECRET_ACCESS_KEY "S3 secret access key"
  fi
}

collect_smtp_config() {
  step "Outbound email (SMTP)"
  if [[ -z "${SMTP_HOST:-}" ]] && is_interactive && ! confirm "Configure SMTP now? (password resets and alerts need it)" y; then
    SMTP_ENABLED="false"
    warn "email disabled — password reset and notification emails will not be delivered"
    return 0
  fi
  SMTP_ENABLED="true"
  ask SMTP_HOST "SMTP host" "${SMTP_HOST:-}"
  ask SMTP_PORT "SMTP port" "${SMTP_PORT:-587}"
  require_valid valid_port SMTP_PORT "expected 1-65535"
  ask_choice SMTP_ENCRYPTION "SMTP encryption:" "${SMTP_ENCRYPTION:-starttls}" starttls tls none
  ask SMTP_USERNAME "SMTP username" "${SMTP_USERNAME:-}"
  [[ -n "${SMTP_PASSWORD:-}" ]] || ask_secret SMTP_PASSWORD "SMTP password"
  ask SMTP_FROM_ADDRESS "From address" "${SMTP_FROM_ADDRESS:-no-reply@${PANEL_DOMAIN}}"
  require_valid valid_email SMTP_FROM_ADDRESS "expected a valid address"
  ask SMTP_FROM_NAME "From name" "${SMTP_FROM_NAME:-Oryz Panel}"
}

collect_auth_config() {
  # The browser bundle talks to a hosted authentication/data backend. Its URL
  # and publishable key are inlined at build time; when they are missing the
  # client bundle throws during hydration and the panel renders a blank page
  # after the server-rendered HTML flashes. Collect them up front.
  step "Authentication backend"
  cat <<'EOF'
  The panel UI authenticates against a hosted backend (URL + publishable key).
  Copy both values from your project's API settings. Leaving them blank keeps
  the public pages working but sign-in will be unavailable.
EOF
  ask SUPABASE_URL "Backend API URL (https://…)" "${SUPABASE_URL:-}"
  ask SUPABASE_PUBLISHABLE_KEY "Backend publishable/anon key" "${SUPABASE_PUBLISHABLE_KEY:-}"
  cat <<'EOF'

  The service/secret key is optional. When provided, the installer creates the
  administrator account directly in the hosted backend (already confirmed, no
  email required). Without it you must register the first account yourself from
  the panel's sign-in page — the first account always becomes the owner.
EOF
  [[ -n "${SUPABASE_SECRET_KEY:-}" ]] ||
    ask_secret SUPABASE_SECRET_KEY "Backend service/secret key (optional, press enter to skip)" || true
  cat <<'EOF'

  Google sign-in talks to Google directly from the browser using your own
  OAuth "Web application" client ID. Create one at console.cloud.google.com,
  add this panel's URL as an Authorised JavaScript origin, and paste the
  client ID below. Leave blank to keep the Google button hidden.
EOF
  if [[ -z "${GOOGLE_AUTH_ENABLED:-}" ]]; then
    if confirm "Enable the 'Continue with Google' button?" n; then
      GOOGLE_AUTH_ENABLED=true
    else
      GOOGLE_AUTH_ENABLED=false
    fi
  fi
  if [[ "${GOOGLE_AUTH_ENABLED}" == "true" ]]; then
    ask GOOGLE_CLIENT_ID "Google OAuth web client ID" "${GOOGLE_CLIENT_ID:-}"
  fi


  if [[ -z "${SUPABASE_URL:-}" || -z "${SUPABASE_PUBLISHABLE_KEY:-}" ]]; then
    warn "authentication backend not configured — sign-in is disabled until you run:
        panelctl config set SUPABASE_URL https://…
        panelctl config set SUPABASE_PUBLISHABLE_KEY …
        panelctl rebuild"
  else
    check_row "Backend" "${SUPABASE_URL}" ok
  fi
}


collect_admin_config() {
  step "Administrator account"
  ask ADMIN_EMAIL "Administrator email" "${ADMIN_EMAIL:-}"
  require_valid valid_email ADMIN_EMAIL "expected a valid address"
  ask ADMIN_NAME "Administrator display name" "${ADMIN_NAME:-Administrator}"
  if [[ -z "${ADMIN_PASSWORD:-}" ]]; then
    if is_interactive; then
      ask_secret ADMIN_PASSWORD "Administrator password (min 12 chars)"
      (( ${#ADMIN_PASSWORD} >= 12 )) || die "administrator password must be at least 12 characters"
      ask_secret ADMIN_PASSWORD_CONFIRM "Repeat administrator password"
      [[ "$ADMIN_PASSWORD" == "$ADMIN_PASSWORD_CONFIRM" ]] || die "passwords do not match"
      unset ADMIN_PASSWORD_CONFIRM
    else
      ADMIN_PASSWORD="$(gen_password 24)"
      ADMIN_PASSWORD_GENERATED=1
    fi
  fi
}

generate_secrets() {
  step "Generating application secrets"
  APP_KEY="${APP_KEY:-$(gen_secret 32)}"
  JWT_SECRET="${JWT_SECRET:-$(gen_secret 64)}"
  JWT_REFRESH_SECRET="${JWT_REFRESH_SECRET:-$(gen_secret 64)}"
  SESSION_SECRET="${SESSION_SECRET:-$(gen_secret 64)}"
  ENCRYPTION_KEY="${ENCRYPTION_KEY:-$(gen_hex 32)}"
  API_SIGNING_SECRET="${API_SIGNING_SECRET:-$(gen_secret 48)}"
  DAEMON_SIGNING_KEY="${DAEMON_SIGNING_KEY:-$(gen_secret 48)}"
  WEBHOOK_SIGNING_SECRET="${WEBHOOK_SIGNING_SECRET:-$(gen_secret 32)}"
  for name in APP_KEY JWT_SECRET JWT_REFRESH_SECRET SESSION_SECRET ENCRYPTION_KEY API_SIGNING_SECRET DAEMON_SIGNING_KEY WEBHOOK_SIGNING_SECRET; do
    check_row "$name" "generated ($(redact "${!name}"))" ok
  done
  success "secrets generated with a cryptographic RNG and never written to logs"
}

write_env_file() {
  step "Writing configuration"
  install -d -m 0750 "$ORYZ_ENV_DIR"

  if [[ -f "$ORYZ_ENV_FILE" && "${ORYZ_OVERWRITE_ENV:-0}" != "1" ]]; then
    local backup="${ORYZ_ENV_FILE}.$(timestamp).bak"
    cp -a "$ORYZ_ENV_FILE" "$backup"; chmod 0600 "$backup"
    warn "existing configuration backed up to $backup"
  fi

  local tmp; tmp="$(mktemp)"; chmod 0600 "$tmp"
  cat >"$tmp" <<EOF
# ${ORYZ_NAME} configuration — generated $(date -u +%FT%TZ)
# Contains secrets. Mode 0640, owned root:${ORYZ_GROUP}. Never commit this file.

# --- application -----------------------------------------------------------
NODE_ENV=production
APP_NAME="${APP_NAME:-Oryz Panel}"
APP_URL=${PANEL_URL}
APP_DOMAIN=${PANEL_DOMAIN}
APP_PORT=${APP_PORT}
APP_HOST=127.0.0.1
PORT=${APP_PORT}
HOST=127.0.0.1
APP_KEY=${APP_KEY}
TRUST_PROXY=true
LOG_LEVEL=${LOG_LEVEL:-info}

# --- websocket -------------------------------------------------------------
WS_PORT=${WS_PORT}
WS_HOST=127.0.0.1
WS_PUBLIC_URL=${PANEL_URL/http/ws}/ws
WS_HEARTBEAT_INTERVAL_MS=25000
WS_MAX_PAYLOAD_BYTES=1048576

# --- database --------------------------------------------------------------
DATABASE_URL=${DATABASE_URL}
DB_HOST=${DB_HOST}
DB_PORT=${DB_PORT}
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASSWORD}
DB_SSLMODE=${DB_SSLMODE:-prefer}
DB_POOL_MAX=${DB_POOL_MAX:-20}

# --- redis / queues --------------------------------------------------------
REDIS_URL=${REDIS_URL}
REDIS_HOST=${REDIS_HOST}
REDIS_PORT=${REDIS_PORT}
REDIS_PASSWORD=${REDIS_PASSWORD:-}
REDIS_DB=${REDIS_DB}
QUEUE_CONCURRENCY=${QUEUE_CONCURRENCY:-5}

# --- secrets ---------------------------------------------------------------
JWT_SECRET=${JWT_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
JWT_ACCESS_TTL=${JWT_ACCESS_TTL:-15m}
JWT_REFRESH_TTL=${JWT_REFRESH_TTL:-30d}
SESSION_SECRET=${SESSION_SECRET}
ENCRYPTION_KEY=${ENCRYPTION_KEY}
API_SIGNING_SECRET=${API_SIGNING_SECRET}
DAEMON_SIGNING_KEY=${DAEMON_SIGNING_KEY}
WEBHOOK_SIGNING_SECRET=${WEBHOOK_SIGNING_SECRET}

# --- storage ---------------------------------------------------------------
STORAGE_DRIVER=${STORAGE_DRIVER}
STORAGE_PATH=${STORAGE_PATH:-$ORYZ_STATE_DIR/storage}
S3_ENDPOINT=${S3_ENDPOINT:-}
S3_REGION=${S3_REGION:-}
S3_BUCKET=${S3_BUCKET:-}
S3_ACCESS_KEY_ID=${S3_ACCESS_KEY_ID:-}
S3_SECRET_ACCESS_KEY=${S3_SECRET_ACCESS_KEY:-}
S3_FORCE_PATH_STYLE=${S3_FORCE_PATH_STYLE:-true}

# --- mail ------------------------------------------------------------------
SMTP_ENABLED=${SMTP_ENABLED:-false}
SMTP_HOST=${SMTP_HOST:-}
SMTP_PORT=${SMTP_PORT:-587}
SMTP_ENCRYPTION=${SMTP_ENCRYPTION:-starttls}
SMTP_USERNAME=${SMTP_USERNAME:-}
SMTP_PASSWORD=${SMTP_PASSWORD:-}
SMTP_FROM_ADDRESS=${SMTP_FROM_ADDRESS:-}
SMTP_FROM_NAME="${SMTP_FROM_NAME:-Oryz Panel}"

# --- tls / proxy -----------------------------------------------------------
PROXY_KIND=${PROXY_KIND}
SSL_MODE=${SSL_MODE}
SSL_EMAIL=${SSL_EMAIL:-}
SSL_CERT_PATH=${SSL_CERT_PATH:-/etc/letsencrypt/live/${PANEL_DOMAIN}/fullchain.pem}
SSL_KEY_PATH=${SSL_KEY_PATH:-/etc/letsencrypt/live/${PANEL_DOMAIN}/privkey.pem}

# --- paths -----------------------------------------------------------------
ORYZ_HOME=${ORYZ_HOME}
ORYZ_APP_DIR=${ORYZ_APP_DIR}
ORYZ_STATE_DIR=${ORYZ_STATE_DIR}
ORYZ_BACKUP_DIR=${ORYZ_BACKUP_DIR}
ORYZ_LOG_DIR=${ORYZ_LOG_DIR}
ORYZ_USER=${ORYZ_USER}
ORYZ_GROUP=${ORYZ_GROUP}

# --- integrations (optional third-party API keys) --------------------------
# Blank means the feature is disabled. Add later: panelctl config set KEY value
CLOUDFLARE_API_TOKEN=${CLOUDFLARE_API_TOKEN:-}
CLOUDFLARE_ZONE_ID=${CLOUDFLARE_ZONE_ID:-}
DISCORD_WEBHOOK_URL=${DISCORD_WEBHOOK_URL:-}
SLACK_WEBHOOK_URL=${SLACK_WEBHOOK_URL:-}
TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN:-}
TELEGRAM_CHAT_ID=${TELEGRAM_CHAT_ID:-}
SENTRY_DSN=${SENTRY_DSN:-}
STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY:-}
STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET:-}
HCAPTCHA_SITE_KEY=${HCAPTCHA_SITE_KEY:-}
HCAPTCHA_SECRET_KEY=${HCAPTCHA_SECRET_KEY:-}
STEAM_API_KEY=${STEAM_API_KEY:-}
CURSEFORGE_API_KEY=${CURSEFORGE_API_KEY:-}

# --- local node (wings) ----------------------------------------------------
WINGS_INSTALLED=${INSTALL_WINGS:-no}
WINGS_CONF_FILE=${WINGS_CONF_FILE:-}
WINGS_NODE_UUID=${WINGS_NODE_UUID:-}

# --- authentication backend ------------------------------------------------
# The first two are inlined into the browser bundle at build time; run
# \`panelctl rebuild\` after changing them. The secret key stays server-side and
# is only used by \`panelctl admin:create\`.
SUPABASE_URL=${SUPABASE_URL:-}
SUPABASE_PUBLISHABLE_KEY=${SUPABASE_PUBLISHABLE_KEY:-}
VITE_SUPABASE_URL=${SUPABASE_URL:-}
VITE_SUPABASE_PUBLISHABLE_KEY=${SUPABASE_PUBLISHABLE_KEY:-}
SUPABASE_SECRET_KEY=${SUPABASE_SECRET_KEY:-}
GOOGLE_AUTH_ENABLED=${GOOGLE_AUTH_ENABLED:-false}
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID:-}


# --- setup wizard ----------------------------------------------------------
# Flipped to false by the installer or by the web wizard on completion.
SETUP_COMPLETE=${SETUP_COMPLETE:-false}
EOF


  cat "$tmp" >"$ORYZ_ENV_FILE"
  rm -f "$tmp"
  secure_env_file "$ORYZ_ENV_FILE"
  check_row "Config file" "$ORYZ_ENV_FILE (0640 root:${ORYZ_GROUP})" ok

  # Application-local symlink so the app reads a single source of truth.
  install -d -o "$ORYZ_USER" -g "$ORYZ_GROUP" -m 0750 "$ORYZ_APP_DIR"
  ln -sfn "$ORYZ_ENV_FILE" "$ORYZ_APP_DIR/.env"
  success "configuration written"
}

create_service_account() {
  step "Service account and directories"
  getent group "$ORYZ_GROUP" >/dev/null 2>&1 || groupadd --system "$ORYZ_GROUP"
  if id -u "$ORYZ_USER" >/dev/null 2>&1; then
    check_row "User" "$ORYZ_USER exists" ok
  else
    useradd --system --gid "$ORYZ_GROUP" --home-dir "$ORYZ_HOME" \
      --shell /usr/sbin/nologin --comment "Oryz Panel" "$ORYZ_USER"
    check_row "User" "$ORYZ_USER created (system, nologin)" ok
  fi
  local d
  for d in "$ORYZ_HOME" "$ORYZ_APP_DIR" "$ORYZ_STATE_DIR" "$ORYZ_BACKUP_DIR" \
           "$ORYZ_LOG_DIR" "${STORAGE_PATH:-$ORYZ_STATE_DIR/storage}" "$ORYZ_HOME/releases" "$ORYZ_HOME/proxy"; do
    install -d -o "$ORYZ_USER" -g "$ORYZ_GROUP" -m 0750 "$d"
  done
  normalize_panel_permissions
  check_row "Directories" "created with 0750 ${ORYZ_USER}:${ORYZ_GROUP}" ok
}
