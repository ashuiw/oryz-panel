#!/usr/bin/env bash
# Reverse proxy configuration rendering (nginx, Caddy, Traefik).

nginx_version() {
  has_cmd nginx || { echo "0.0.0"; return 0; }
  nginx -v 2>&1 | sed -n 's|.*nginx/\([0-9.]*\).*|\1|p' | awk 'NR==1'
}

nginx_supports_http2_directive() {
  # `http2 on;` exists only from nginx 1.25.1; older builds need `listen ... http2`.
  local v major minor patch
  v="$(nginx_version)"; v="${v:-0.0.0}"
  IFS=. read -r major minor patch <<<"$v"
  major="${major:-0}"; minor="${minor:-0}"; patch="${patch:-0}"
  (( major > 1 )) && return 0
  (( major < 1 )) && return 1
  (( minor > 25 )) && return 0
  (( minor < 25 )) && return 1
  (( patch >= 1 ))
}

# Fill in every variable the templates need. Installs export PANEL_DOMAIN, but
# `panelctl rebuild` only loads /etc/oryz/oryz.env, which uses APP_DOMAIN — so
# derive missing values instead of failing under `set -u`.
proxy_resolve_vars() {
  PANEL_DOMAIN="${PANEL_DOMAIN:-${APP_DOMAIN:-}}"
  if [[ -z "$PANEL_DOMAIN" && -n "${APP_URL:-}" ]]; then
    PANEL_DOMAIN="${APP_URL#*://}"; PANEL_DOMAIN="${PANEL_DOMAIN%%/*}"
  fi
  [[ -n "$PANEL_DOMAIN" ]] ||
    die "no panel domain configured — run: panelctl config set APP_DOMAIN panel.example.com"
  APP_DOMAIN="${APP_DOMAIN:-$PANEL_DOMAIN}"
  APP_PORT="${APP_PORT:-3000}"
  WS_PORT="${WS_PORT:-3001}"
  ORYZ_APP_DIR="${ORYZ_APP_DIR:-/opt/oryz/app}"
  PROXY_KIND="${PROXY_KIND:-nginx}"
  SSL_MODE="${SSL_MODE:-letsencrypt}"
  SSL_EMAIL="${SSL_EMAIL:-admin@${PANEL_DOMAIN}}"
  SSL_CERT_PATH="${SSL_CERT_PATH:-/etc/letsencrypt/live/${PANEL_DOMAIN}/fullchain.pem}"
  SSL_KEY_PATH="${SSL_KEY_PATH:-/etc/letsencrypt/live/${PANEL_DOMAIN}/privkey.pem}"
}

render_template() {
  # render_template src dest — substitutes @@VAR@@ placeholders.
  local src="$1" dest="$2"
  proxy_resolve_vars
  [[ -f "$src" ]] || die "missing template: $src"

  local http2_listen="" http2_directive=""
  if nginx_supports_http2_directive; then
    http2_directive="    http2 on;"
  else
    http2_listen=" http2"
  fi
  sed \
    -e "s|@@DOMAIN@@|${PANEL_DOMAIN}|g" \
    -e "s|@@APP_PORT@@|${APP_PORT}|g" \
    -e "s|@@WS_PORT@@|${WS_PORT}|g" \
    -e "s|@@APP_DIR@@|${ORYZ_APP_DIR}|g" \
    -e "s|@@SSL_CERT@@|${SSL_CERT_PATH}|g" \
    -e "s|@@SSL_KEY@@|${SSL_KEY_PATH}|g" \
    -e "s|@@SSL_EMAIL@@|${SSL_EMAIL:-admin@${PANEL_DOMAIN}}|g" \
    -e "s|@@HTTP2_LISTEN@@|${http2_listen}|g" \
    -e "s|@@HTTP2_DIRECTIVE@@|${http2_directive}|g" \
    "$src" >"$dest"
  chmod 0644 "$dest"
}


configure_nginx() {
  local tpl_dir="$1"
  local site="/etc/nginx/sites-available/${ORYZ_SLUG}.conf"
  install -d -m 0755 /etc/nginx/sites-available /etc/nginx/sites-enabled /etc/nginx/snippets

  render_template "$tpl_dir/nginx/oryz.conf" "$site"
  render_template "$tpl_dir/nginx/security-headers.conf" /etc/nginx/snippets/oryz-security.conf
  render_template "$tpl_dir/nginx/ratelimit.conf" /etc/nginx/conf.d/oryz-ratelimit.conf

  # TLS-less variant until a certificate exists; upgraded by lib/ssl.sh.
  if [[ "${SSL_MODE}" == "none" || ! -f "${SSL_CERT_PATH}" ]]; then
    render_template "$tpl_dir/nginx/oryz-http.conf" "$site"
  fi

  ln -sfn "$site" "/etc/nginx/sites-enabled/${ORYZ_SLUG}.conf"
  [[ -e /etc/nginx/sites-enabled/default ]] && rm -f /etc/nginx/sites-enabled/default

  nginx -t >/dev/null 2>&1 || { nginx -t; die "generated nginx configuration is invalid"; }
  systemctl enable nginx >/dev/null 2>&1 || true
  systemctl reload nginx 2>/dev/null || systemctl restart nginx
  check_row "Nginx" "site enabled and reloaded" ok
}

configure_caddy() {
  local tpl_dir="$1"
  install -d -m 0755 /etc/caddy
  render_template "$tpl_dir/caddy/Caddyfile" /etc/caddy/Caddyfile
  caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1 ||
    warn "caddy validate reported issues — review /etc/caddy/Caddyfile"
  systemctl enable caddy >/dev/null 2>&1 || true
  systemctl reload caddy 2>/dev/null || systemctl restart caddy
  check_row "Caddy" "Caddyfile written, automatic HTTPS enabled" ok
}

configure_traefik() {
  local tpl_dir="$1"
  install -d -m 0755 "$ORYZ_HOME/proxy"
  render_template "$tpl_dir/traefik/dynamic.yml" "$ORYZ_HOME/proxy/traefik-dynamic.yml"
  render_template "$tpl_dir/traefik/static.yml" "$ORYZ_HOME/proxy/traefik-static.yml"
  check_row "Traefik" "config written to $ORYZ_HOME/proxy/ (load it in your Traefik instance)" ok
}

configure_reverse_proxy() {
  step "Reverse proxy"
  proxy_resolve_vars
  local tpl_dir="${ORYZ_TEMPLATE_DIR:-$ORYZ_APP_DIR/deploy/templates}"
  case "${PROXY_KIND:-nginx}" in
    nginx)   configure_nginx "$tpl_dir" ;;
    caddy)   configure_caddy "$tpl_dir" ;;
    traefik) configure_traefik "$tpl_dir" ;;
    none)    check_row "Reverse proxy" "skipped by request" ok ;;
  esac
}
