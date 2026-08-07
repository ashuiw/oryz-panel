# Reverse proxy

The panel listens on loopback only (`127.0.0.1:3000` for HTTP,
`127.0.0.1:3001` for WebSockets). A reverse proxy terminates TLS, serves static
assets and applies rate limits. The installer can configure nginx or Caddy for
you and writes a Traefik configuration you can load into an existing instance.

Templates live in `deploy/templates/`.

## Requirements any proxy must satisfy

| Requirement | Why |
| --- | --- |
| WebSocket upgrade on `/ws` | live console and resource streams |
| No read timeout on `/ws` (or ≥ 1 hour) | consoles stay open for hours |
| No response buffering on `/ws` | console output must arrive immediately |
| `X-Forwarded-For` / `X-Forwarded-Proto` | correct client IPs in the audit log |
| `client_max_body_size` ≥ 512 MB | server file uploads |
| Long-lived asset caching for `/_build/*` | hashed filenames, safe to cache forever |
| HTTP/2 | many small asset requests |

## nginx

Installed to `/etc/nginx/sites-available/oryz.conf`, with
`snippets/oryz-security.conf` (security headers, CSP) and
`conf.d/oryz-ratelimit.conf` (rate limit zones).

Rate limits: 30 r/s general, 20 r/s API, 1 r/s on authentication endpoints with
a burst of 10, all returning HTTP 429.

```bash
sudo nginx -t && sudo systemctl reload nginx
```

Before a certificate exists the installer uses the plain-HTTP variant
(`oryz-http.conf`) and upgrades the site once certbot succeeds.

## Caddy

Written to `/etc/caddy/Caddyfile`. Caddy obtains and renews certificates
automatically — no certbot, no timer. Includes zstd/gzip compression, HTTP/3,
the same security headers and static asset handling.

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Rate limiting requires the `caddy-ratelimit` plugin; the template ships it
commented out so a stock Caddy build starts cleanly.

## Traefik

Traefik is assumed to be managed externally, so the installer only writes:

- `/opt/oryz/proxy/traefik-static.yml` — entrypoints, ACME resolver
- `/opt/oryz/proxy/traefik-dynamic.yml` — routers, services, middlewares

Copy the dynamic file to your Traefik dynamic directory and merge the static
parts into your existing `traefik.yml`. `readTimeout: 0s` on the websecure
entrypoint is required, otherwise consoles disconnect.

## Terminating TLS elsewhere

Behind a load balancer or Cloudflare, install with `--proxy none --ssl none`
and point the upstream at `127.0.0.1:3000` and `127.0.0.1:3001`. Keep
`TRUST_PROXY=true` and make sure the upstream sets `X-Forwarded-Proto: https`,
or generated links will use `http://`.

## Firewall

```bash
sudo ufw allow 80,443/tcp
sudo ufw deny 3000,3001,5432,6379/tcp   # never expose these directly
sudo ufw enable
```

## Changing the domain

```bash
sudo panelctl config set APP_DOMAIN panel.new.example
sudo panelctl config set APP_URL https://panel.new.example
sudo panelctl ssl renew
sudo panelctl restart
```
