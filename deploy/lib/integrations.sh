#!/usr/bin/env bash
# Third-party API keys and integration credentials.
#
# Every key is optional except the ones a chosen feature requires: the panel
# never hardcodes a vendor key and never ships one. Anything left blank simply
# disables the corresponding feature, and can be added later with
# `panelctl config set KEY value`.

collect_integration_keys() {
  step "Integrations and API keys"
  cat <<EOF
  Keys are stored only in ${ORYZ_ENV_FILE} (mode 0640) and are never sent
  anywhere by the installer. Leave blank to skip a feature.

EOF

  # Object storage for off-site backups (required when STORAGE_DRIVER=s3;
  # collected already in the storage step, so only prompt when unset).
  if [[ "${STORAGE_DRIVER:-local}" == "s3" && -z "${S3_ACCESS_KEY_ID:-}" ]]; then
    ask S3_ACCESS_KEY_ID "S3 access key id" ""
    ask_secret S3_SECRET_ACCESS_KEY "S3 secret access key"
  fi

  if is_interactive && ! confirm "Configure optional integrations now?" n; then
    info "skipped — add keys later with: panelctl config set KEY value"
    return 0
  fi

  # DNS / proxy automation
  ask_secret_optional CLOUDFLARE_API_TOKEN "Cloudflare API token (DNS-01 certificates, optional)"
  ask CLOUDFLARE_ZONE_ID "Cloudflare zone id (optional)" "${CLOUDFLARE_ZONE_ID:-}"

  # Alerting
  ask_secret_optional DISCORD_WEBHOOK_URL "Discord webhook URL for alerts (optional)"
  ask_secret_optional SLACK_WEBHOOK_URL "Slack webhook URL for alerts (optional)"
  ask_secret_optional TELEGRAM_BOT_TOKEN "Telegram bot token (optional)"
  ask TELEGRAM_CHAT_ID "Telegram chat id (optional)" "${TELEGRAM_CHAT_ID:-}"

  # Error tracking and analytics
  ask SENTRY_DSN "Sentry DSN for error reporting (optional)" "${SENTRY_DSN:-}"

  # Billing, if this panel sells hosting
  ask_secret_optional STRIPE_SECRET_KEY "Stripe secret key (optional, billing)"
  ask_secret_optional STRIPE_WEBHOOK_SECRET "Stripe webhook signing secret (optional)"

  # Captcha on public sign-up
  ask HCAPTCHA_SITE_KEY "hCaptcha site key (optional)" "${HCAPTCHA_SITE_KEY:-}"
  ask_secret_optional HCAPTCHA_SECRET_KEY "hCaptcha secret key (optional)"

  # Game service lookups
  ask_secret_optional STEAM_API_KEY "Steam Web API key (optional, Steam workshop/eggs)"
  ask_secret_optional CURSEFORGE_API_KEY "CurseForge API key (optional, modpack installs)"
}

# Like ask_secret, but an empty answer is accepted and simply leaves the key unset.
ask_secret_optional() {
  local var="$1" prompt="$2" value=""
  if [[ -n "${!var:-}" ]]; then return 0; fi
  if is_interactive; then
    read -r -s -p "  ${prompt}: " value || true
    printf '\n'
  fi
  printf -v "$var" '%s' "$value"
}
