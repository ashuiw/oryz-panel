#!/usr/bin/env bash
# TLS certificate provisioning and renewal.

issue_letsencrypt() {
  step "TLS — Let's Encrypt"
  case "${PROXY_KIND}" in
    caddy)
      check_row "Certificate" "handled automatically by Caddy" ok
      return 0 ;;
    traefik)
      check_row "Certificate" "handled by Traefik ACME resolver (see traefik-static.yml)" ok
      return 0 ;;
  esac

  if [[ -f "/etc/letsencrypt/live/${PANEL_DOMAIN}/fullchain.pem" ]]; then
    check_row "Certificate" "existing certificate for ${PANEL_DOMAIN} reused" ok
  else
    log "requesting a certificate for ${PANEL_DOMAIN}…"
    if ! certbot --nginx --non-interactive --agree-tos \
        -m "$SSL_EMAIL" -d "$PANEL_DOMAIN" --redirect >/dev/null 2>&1; then
      warn "certificate issuance failed — the panel is serving plain HTTP for now"
      warn "check that ${PANEL_DOMAIN} resolves to this host and port 80 is reachable, then run: panelctl ssl renew"
      return 0
    fi
    check_row "Certificate" "issued for ${PANEL_DOMAIN}" ok
  fi
  SSL_CERT_PATH="/etc/letsencrypt/live/${PANEL_DOMAIN}/fullchain.pem"
  SSL_KEY_PATH="/etc/letsencrypt/live/${PANEL_DOMAIN}/privkey.pem"
  enable_renewal
}

enable_renewal() {
  # certbot ships a systemd timer on Debian/Ubuntu; make sure it is running and
  # that the proxy picks up the renewed certificate.
  install -d -m 0755 /etc/letsencrypt/renewal-hooks/deploy
  cat >/etc/letsencrypt/renewal-hooks/deploy/oryz-reload.sh <<'EOF'
#!/usr/bin/env bash
# Reload the reverse proxy after a certificate renewal.
systemctl reload nginx 2>/dev/null || true
systemctl reload caddy 2>/dev/null || true
EOF
  chmod 0755 /etc/letsencrypt/renewal-hooks/deploy/oryz-reload.sh
  systemctl enable --now certbot.timer >/dev/null 2>&1 || true
  check_row "Auto-renewal" "certbot.timer enabled with proxy reload hook" ok
}

use_existing_certificate() {
  step "TLS — existing certificate"
  [[ -f "$SSL_CERT_PATH" ]] || die "certificate not found: $SSL_CERT_PATH"
  [[ -f "$SSL_KEY_PATH" ]]  || die "private key not found: $SSL_KEY_PATH"
  openssl x509 -in "$SSL_CERT_PATH" -noout >/dev/null 2>&1 || die "$SSL_CERT_PATH is not a valid certificate"
  chmod 0640 "$SSL_KEY_PATH" 2>/dev/null || true
  local expiry; expiry="$(openssl x509 -in "$SSL_CERT_PATH" -noout -enddate | cut -d= -f2)"
  check_row "Certificate" "valid until ${expiry}" ok
  warn "renewal of an externally supplied certificate is your responsibility"
}

generate_self_signed() {
  step "TLS — self-signed (development only)"
  local dir="/etc/ssl/oryz"
  install -d -m 0750 "$dir"
  SSL_CERT_PATH="$dir/${PANEL_DOMAIN}.crt"
  SSL_KEY_PATH="$dir/${PANEL_DOMAIN}.key"
  if [[ ! -f "$SSL_CERT_PATH" ]]; then
    openssl req -x509 -nodes -newkey rsa:4096 -days 825 \
      -keyout "$SSL_KEY_PATH" -out "$SSL_CERT_PATH" \
      -subj "/CN=${PANEL_DOMAIN}" \
      -addext "subjectAltName=DNS:${PANEL_DOMAIN}" >/dev/null 2>&1
  fi
  chmod 0600 "$SSL_KEY_PATH"; chmod 0644 "$SSL_CERT_PATH"
  check_row "Certificate" "self-signed — do not use in production" warn
}

configure_ssl() {
  case "${SSL_MODE:-letsencrypt}" in
    letsencrypt) issue_letsencrypt ;;
    existing)    use_existing_certificate ;;
    selfsigned)  generate_self_signed ;;
    none)        check_row "TLS" "disabled — terminate TLS upstream" warn ;;
  esac
  env_set SSL_CERT_PATH "$SSL_CERT_PATH"
  env_set SSL_KEY_PATH "$SSL_KEY_PATH"
}
