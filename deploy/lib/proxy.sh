#!/usr/bin/env bash
# Reverse proxy configuration rendering (nginx, Caddy, Traefik).

render_template() {
  # render_template src dest — substitutes @@VAR@@ placeholders.
  local src="$1" dest="$2"
  [[ -f "$src" ]] || die "missing template: $src"
  sed \
    -e "s|@@DOMAIN@@|${PANEL_DOMAIN}|g" \
    -e "s|@@APP_PORT@@|${APP_PORT}|g" \
    -e "s|@@WS_PORT@@|${WS_PORT}|g" \
    -e "s|@@APP_DIR@@|${ORYZ_APP_DIR}|g" \
    -e "s|@@SSL_CERT@@|${SSL_CERT_PATH}|g" \
    -e "s|@@SSL_KEY@@|${SSL_KEY_PATH}|g" \
    -e "s|@@SSL_EMAIL@@|${SSL_EMAIL:-admin@${PANEL_DOMAIN}}|g" \
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
  local tpl_dir="${ORYZ_TEMPLATE_DIR:-$ORYZ_APP_DIR/deploy/templates}"
  case "${PROXY_KIND:-nginx}" in
    nginx)   configure_nginx "$tpl_dir" ;;
    caddy)   configure_caddy "$tpl_dir" ;;
    traefik) configure_traefik "$tpl_dir" ;;
    none)    check_row "Reverse proxy" "skipped by request" ok ;;
  esac
}
