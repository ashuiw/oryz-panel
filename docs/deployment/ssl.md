# SSL / TLS

Choose the mode at install time with `--ssl`, or change it later with
`panelctl config set SSL_MODE …`.

| Mode | Use for |
| --- | --- |
| `letsencrypt` | production (default) |
| `existing` | a certificate you already own, or a corporate CA |
| `selfsigned` | local development only |
| `none` | TLS terminated by an upstream load balancer |

## Let's Encrypt

Requires: the domain resolves to this host, port 80 reachable from the
internet, and a valid contact email.

With **nginx**, the installer runs certbot with the nginx plugin, then enables
`certbot.timer` and installs a deploy hook that reloads the proxy after each
renewal. With **Caddy** or **Traefik**, ACME is handled natively by the proxy
and certbot is not installed at all.

```bash
sudo panelctl ssl status     # issuer, expiry, renewal timer state
sudo panelctl ssl renew      # force renewal now
sudo certbot certificates    # full certbot view
```

Renewal runs twice daily and only acts when a certificate is within 30 days of
expiry. `panelctl doctor` warns at 21 days and fails once expired.

### Wildcards

Wildcard certificates need a DNS-01 challenge:

```bash
sudo certbot certonly --dns-cloudflare \
  --dns-cloudflare-credentials /root/.secrets/cloudflare.ini \
  -d '*.example.com' -d example.com
sudo panelctl config set SSL_CERT_PATH /etc/letsencrypt/live/example.com/fullchain.pem
sudo panelctl config set SSL_KEY_PATH  /etc/letsencrypt/live/example.com/privkey.pem
sudo systemctl reload nginx
```

## Existing certificate

```bash
sudo install -m 0644 fullchain.pem /etc/ssl/certs/oryz.pem
sudo install -m 0600 privkey.pem  /etc/ssl/private/oryz.key
sudo ./install.sh --ssl existing \
  --domain panel.example.com
```

Supply the full chain (leaf + intermediates), not just the leaf, or mobile
clients will report an untrusted certificate. Renewal is your responsibility;
`panelctl doctor` still warns before expiry.

## Self-signed

Development only. Every browser shows a warning and OAuth providers reject the
callback URL.

```bash
sudo ./install.sh --ssl selfsigned --domain panel.local
```

## Hardening

The shipped nginx configuration already enables TLS 1.2/1.3 only, modern cipher
suites, OCSP stapling, session tickets off and HSTS with a two-year max-age and
`preload`.

Only submit your domain to the HSTS preload list once you are certain every
subdomain will serve HTTPS permanently — removal takes months.

## Verifying

```bash
curl -vI https://panel.example.com 2>&1 | grep -Ei 'HTTP/|strict-transport'
openssl s_client -connect panel.example.com:443 -servername panel.example.com </dev/null 2>/dev/null \
  | openssl x509 -noout -issuer -subject -dates
```
