# Installation

Oryz Panel installs on a fresh Linux VPS with one command. The installer
validates the host, installs only what is missing, provisions PostgreSQL and
Redis, generates secrets, builds the app and registers systemd services.

## Supported operating systems

| Distribution | Status |
| --- | --- |
| Ubuntu 22.04 LTS | Supported |
| Ubuntu 24.04 LTS | Supported |
| Debian 12 (bookworm) | Supported |
| Debian 13 (trixie) | Supported |

Anything else is refused unless you pass `--force-os`, which is unsupported.
Adding a distribution means one entry in `SUPPORTED_MATRIX` in
`deploy/lib/preflight.sh` and, if package names differ, a branch in
`pkg_install` in `deploy/lib/deps.sh`.

## Requirements

| Resource | Minimum | Recommended |
| --- | --- | --- |
| CPU | 2 cores | 4 cores |
| RAM | 2 GB | 4 GB |
| Disk | 10 GB free | 40 GB free |
| Network | Public IPv4, ports 80/443 open | — |
| Other | systemd, root access, DNS A record pointing at the host | — |

Point your domain at the server **before** installing, otherwise Let's Encrypt
cannot issue a certificate and the installer falls back to plain HTTP.

## What you can install

The installer's first question is what this host should run:

| Choice | Installs |
| --- | --- |
| `panel+wings` | web panel plus one local node — good for a single machine |
| `panel` | web panel only; nodes are installed separately |
| `wings` | node daemon only; attaches to any existing panel |

Wings-only hosts print a portable node configuration you paste into **any**
Oryz panel. See [wings.md](wings.md).

## Method 1 — interactive installer

```bash
git clone https://github.com/oryz-panel/oryz.git
cd oryz/deploy
sudo ./install.sh
```

The flow is:

1. Welcome
2. System validation (OS, virtualization, CPU, RAM, disk, conflicts)
3. Domain, ports, reverse proxy, TLS mode
4. PostgreSQL configuration
5. Redis configuration
6. Storage configuration
7. SMTP configuration
8. Administrator account
9. Review screen — nothing is written before you confirm
10. Dependency installation
11. Secret generation
12. Build
13. Database creation, migrations, seed data
14. Reverse proxy and certificate
15. systemd services
16. Verification, then the dashboard URL

## Method 2 — one-liner

```bash
curl -fsSL https://install.oryz.example/install.sh | sudo bash
```

Add `-s -- --non-interactive` for a fully unattended run. Always read a remote
script before piping it to a shell.

## Method 3 — unattended with an answers file

```bash
sudo install -m 0600 deploy/answers.example.env /root/oryz-answers.env
sudo nano /root/oryz-answers.env
sudo ./install.sh --non-interactive --config /root/oryz-answers.env
```

Every interactive prompt maps to one variable, so an interactive run can always
be reproduced. Environment variables work too:

```bash
sudo PANEL_DOMAIN=panel.example.com ADMIN_EMAIL=admin@example.com \
     SSL_EMAIL=admin@example.com ORYZ_ASSUME_YES=1 \
     ./install.sh --non-interactive
```

## Command-line options

```
    --components KIND   panel+wings | panel | wings
    --wings-panel URL   panel a wings-only node registers with
    --node-name NAME    node name for a wings install
    --node-token TOKEN  node token issued by the panel
-y, --non-interactive   never prompt
-c, --config FILE       load answers from a KEY=VALUE file
    --domain FQDN       panel domain
    --admin-email MAIL  administrator email
    --proxy KIND        nginx | caddy | traefik | none
    --ssl MODE          letsencrypt | existing | selfsigned | none
    --db-mode MODE      local | remote
    --redis-mode MODE   local | remote
    --storage DRIVER    local | s3
    --with-docker       also install the Docker engine
    --skip-build        reuse an existing build
    --source DIR        install from a local source tree
    --assume-yes        accept destructive confirmations
    --force-os          continue on an unsupported distribution
```

## What gets created

| Path | Purpose |
| --- | --- |
| `/opt/oryz/app` | application code and build output |
| `/etc/oryz/oryz.env` | configuration and secrets (0640 `root:oryz`) |
| `/var/lib/oryz` | storage, state |
| `/var/lib/oryz/backups` | backup archives (0700) |
| `/var/log/oryz` | service logs, rotated daily for 14 days |
| `/etc/systemd/system/oryz-*.service` | services |
| `/usr/local/bin/panelctl` | administration CLI |
| `/etc/oryz-wings/config.yml` | node configuration and token (wings hosts, 0640) |
| `/var/lib/oryz-wings` | per-node server volumes, backups and state |

The panel runs as the system user `oryz`, which has no login shell.

## After installing

```bash
sudo panelctl status     # services
sudo panelctl doctor     # full health check
sudo panelctl logs -f    # follow logs
```

Then open the dashboard URL and sign in with the administrator account. If the
password was generated, read it once with:

```bash
sudo panelctl config get-admin-password
```

## Web setup wizard

If the application starts without a completed configuration
(`SETUP_COMPLETE=false`), it serves a browser-based wizard at `/setup` that
covers the same steps. It disables itself permanently once finished. See
[setup-wizard.md](setup-wizard.md).

## Next

- [Production deployment](production.md)
- [Reverse proxy](reverse-proxy.md)
- [SSL](ssl.md)
- [Verification checklist](verification-checklist.md)
