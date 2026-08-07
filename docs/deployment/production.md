# Production deployment

## Topology

```text
                    ┌───────────────────────────────┐
   Internet ─────►  │  Reverse proxy (nginx/Caddy)  │  :80 :443
                    │  TLS · HTTP/2 · rate limits   │
                    └──────────┬──────────┬─────────┘
                               │          │
                    :3000 HTTP │          │ :3001 WebSocket
                    ┌──────────▼──────────▼─────────┐
                    │  oryz-api    oryz-web     │
                    │  oryz-worker oryz-queue   │
                    │  oryz-scheduler             │
                    └──────┬──────────────┬─────────┘
                           │              │
                 ┌─────────▼───┐   ┌──────▼──────┐
                 │ PostgreSQL  │   │   Redis     │
                 └─────────────┘   └─────────────┘
                           │
                 ┌─────────▼─────────────────────┐
                 │  Daemon nodes (game servers)  │  mTLS/JWT over HTTPS+WSS
                 └───────────────────────────────┘
```

Run the panel and the game-server nodes on **different hosts**. A busy game
server will starve the panel of CPU, and a compromised container should never
sit next to the database.

## Sizing

| Scale | Panel host | Notes |
| --- | --- | --- |
| < 25 servers | 2 vCPU, 4 GB, 40 GB SSD | everything on one host is fine |
| 25–150 | 4 vCPU, 8 GB, 80 GB SSD | move PostgreSQL to its own host |
| 150+ | 8 vCPU, 16 GB | managed PostgreSQL, separate Redis, 2+ panel hosts behind a load balancer |

## Services

| Unit | Role |
| --- | --- |
| `oryz-api` | HTTP API and WebSocket gateway |
| `oryz-web` | SSR frontend renderer |
| `oryz-worker` | background jobs (installs, rebuilds) |
| `oryz-queue` | queue consumers (backups, transfers) |
| `oryz-scheduler` | cron-like scheduled tasks |
| `oryz.target` | groups them all |

```bash
sudo systemctl start oryz.target
sudo systemctl restart oryz-api
sudo systemctl status oryz-queue
```

All units run as the unprivileged `oryz` user with `ProtectSystem=strict`,
`PrivateTmp`, an empty capability bounding set and a `@system-service` syscall
filter. They may only write to `/var/lib/oryz`, `/var/log/oryz` and the
build output directory.

## Hardening checklist

- Key-only SSH, root login disabled, non-standard port optional.
- `ufw` allowing only 22, 80, 443; 3000/3001/5432/6379 blocked from outside.
- `fail2ban` on SSH and nginx auth endpoints.
- `unattended-upgrades` for security patches.
- PostgreSQL and Redis bound to `127.0.0.1` with password authentication.
- `/etc/oryz/oryz.env` at 0640 `root:oryz` — verified by `panelctl doctor`.
- Backups encrypted and shipped off-host.
- HSTS enabled (default), CSP left restrictive.

## Multi-host notes

Running more than one panel host requires shared state:

- **Database** — one PostgreSQL, not one per host.
- **Redis** — shared, for sessions and the queue.
- **Storage** — set `STORAGE_DRIVER=s3` so every host sees the same objects.
- **Scheduler** — run `oryz-scheduler` on exactly one host, or tasks fire
  multiple times. Disable it elsewhere: `sudo systemctl disable --now oryz-scheduler`.
- **Sticky sessions** are not required; WebSockets connect to whichever host
  the load balancer picks.

## Monitoring

Scrape `GET /api/health` (liveness) and `GET /api/health/ready` (dependencies).
Page on: any unit inactive, HTTP 5xx rate, certificate < 14 days, disk > 85 %,
queue depth growing for more than 10 minutes, node heartbeat gaps.

```bash
*/5 * * * * root /usr/local/bin/panelctl doctor >/var/log/oryz/doctor.log 2>&1 || \
  logger -t oryz "health check failed"
```

## Routine maintenance

| Cadence | Task |
| --- | --- |
| Daily | automated backup, log review |
| Weekly | `panelctl doctor`, OS security updates |
| Monthly | `panelctl update --check`, restore rehearsal on staging |
| Quarterly | rotate API keys and the daemon signing key, audit user roles |

Rotating `ENCRYPTION_KEY` makes existing encrypted values unreadable — only do
it with a documented re-encryption plan.
