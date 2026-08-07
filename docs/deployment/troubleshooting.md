# Troubleshooting

Start here:

```bash
sudo panelctl doctor
```

Every failed check prints the exact command to run next. The sections below
cover what `doctor` cannot fix on its own.

## Reading logs

```bash
sudo panelctl logs -f              # all panel services
sudo panelctl logs -f api          # one service
sudo journalctl -u oryz-api -n 200 --no-pager
sudo tail -f /var/log/nginx/oryz.error.log
sudo tail -f /var/log/oryz/api.error.log
```

Installer output is at `/var/log/oryz/install.log`. Secrets are never written
to it.

## Common issues

### The installer refuses to run

`unsupported operating system` — check `cat /etc/os-release` against the
support matrix. `ORYZ_FORCE_OS=1` continues at your own risk.

`N blocking requirement(s) not met` — RAM, disk or systemd. Free space with
`sudo apt-get clean && sudo journalctl --vacuum-time=7d`, or resize the VPS.

`port 80 already bound` — something else is serving HTTP:
`sudo ss -ltnp | grep ':80'`. Stop Apache with
`sudo systemctl disable --now apache2`.

### 502 Bad Gateway

The proxy is up but the panel is not.

```bash
sudo systemctl status oryz-api
sudo journalctl -u oryz-api -n 100
sudo ss -ltn | grep 3000
```

Usually a bad `DATABASE_URL` or an unreachable Redis; the API exits on startup
and systemd restarts it in a loop. Fix the config, then
`sudo panelctl restart`.

### The console never connects

`/ws` is not being proxied, or a timeout is closing it.

```bash
curl -i -N -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
     -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
     http://127.0.0.1:3001/ws
```

Expect `101 Switching Protocols`. If it works locally but not through the
proxy, re-check the `/ws` block: `proxy_buffering off` and a read timeout of at
least 3600 s. Cloudflare users: WebSockets must be enabled in the dashboard.

### Certificate issuance failed

```bash
dig +short panel.example.com          # must be this server's IP
sudo ss -ltn | grep ':80'             # port 80 must be reachable
sudo certbot certificates
sudo panelctl ssl renew
```

Let's Encrypt rate-limits five failures per account, per hostname, per hour.
Wait rather than retrying in a loop.

### Database connection refused

```bash
sudo systemctl status postgresql
sudo -u postgres psql -c '\l'
PGPASSWORD='…' psql -h 127.0.0.1 -U oryz -d oryz -c 'select 1'
```

For a remote database, confirm `pg_hba.conf` allows the panel's IP and that
`DB_SSLMODE` matches the server's requirement.

### Redis authentication error

`NOAUTH Authentication required` means `REDIS_PASSWORD` in `oryz.env` does
not match `requirepass` in `/etc/redis/redis.conf`. Align them and restart both
services.

### Migrations fail

The transaction rolls back, so the schema is untouched. Read the SQL error,
fix the migration, then:

```bash
sudo panelctl update --migrate-only
```

`migration X changed since it was applied` means an applied file was edited —
write a new migration instead of editing history.

### Services restart in a loop

```bash
systemctl show -p NRestarts oryz-api
sudo journalctl -u oryz-api -p err -n 50
```

`start-limit-hit` means systemd gave up after five restarts in 60 s. Fix the
cause, then `sudo systemctl reset-failed oryz-api && sudo panelctl restart`.

### Out of disk

```bash
df -h
sudo panelctl backup --prune 5
sudo journalctl --vacuum-size=200M
sudo du -sh /var/lib/oryz/* /var/log/* | sort -h | tail
```

### Slow panel

Check `htop`, then `panelctl doctor`. Common causes: PostgreSQL on an
undersized instance, `DB_POOL_MAX` too low for the workload, or a node that is
unreachable so every request waits for a timeout.

## Emergency recovery

```bash
sudo panelctl stop
sudo panelctl backup --label emergency
sudo panelctl restore <last-known-good>
sudo panelctl doctor
```

## Reporting a problem

Include: OS and version, `panelctl version`, the failing `panelctl doctor`
output, and the last 50 log lines. **Redact `oryz.env` before sharing it** —
it contains every secret the panel holds.
