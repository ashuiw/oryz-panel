# Oryz Panel — VPS Installation Guide

A complete, self-hosted game server management platform. This guide covers installing **Oryz Panel** on your own VPS.

---

## What you need

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| CPU | 2 cores | 4 cores |
| RAM | 2 GB | 4 GB |
| Disk | 10 GB free | 40 GB free |
| Network | Public IPv4, ports 80/443 open | — |
| OS | Ubuntu 22.04/24.04 LTS or Debian 12/13 | — |
| Access | root (or sudo) | — |
| DNS | A record pointing at the host | — |

> **Important:** Point your domain at the server **before** installing. Let's Encrypt needs it to issue a certificate.

---

## Choose your install mode

Oryz has three install modes:

| Mode | Use case |
|------|----------|
| `panel+wings` | Single machine: web panel + local node (default) |
| `panel` | Web panel only; nodes are installed on separate machines |
| `wings` | Node daemon only; connects to an existing panel |

Run `panel+wings` if this is your only server. Run `panel` on the main machine and `wings` on each additional game-server machine.

---

## Method 1 — One-liner (interactive)

```bash
curl -fsSL https://install.oryz.example/install.sh | sudo bash
```

The installer will ask for:

- Component mode (`panel+wings`, `panel`, or `wings`)
- Panel domain (e.g. `panel.example.com`)
- Administrator email and password
- Reverse proxy (`nginx`, `caddy`, `traefik`, or `none`)
- TLS mode (`letsencrypt`, `existing`, `selfsigned`, or `none`)
- Database mode (`local` or `remote`)
- Redis mode (`local` or `remote`)
- Storage driver (`local` or `s3`)
- Optional integrations (Cloudflare, Discord, Stripe, etc.)

Nothing is written until you confirm the final review screen.

---

## Method 2 — Clone and run

```bash
git clone https://github.com/oryz-panel/oryz.git
cd oryz/deploy
sudo ./install.sh
```

Use this if you prefer to inspect the installer before running it. When run from a checkout, the installer builds from that local source tree — it does not download a release archive.

If you keep the source elsewhere, point the installer at it explicitly:

```bash
sudo ./install.sh --source /path/to/oryz
```


---

## Method 3 — Unattended install

Create an answers file:

```bash
sudo install -m 0600 deploy/answers.example.env /root/oryz-answers.env
sudo nano /root/oryz-answers.env
```

Then run:

```bash
sudo ./install.sh --non-interactive --config /root/oryz-answers.env
```

You can also pass values as environment variables:

```bash
sudo PANEL_DOMAIN=panel.example.com \
     ADMIN_EMAIL=admin@example.com \
     ADMIN_PASSWORD=your-strong-password \
     SSL_EMAIL=admin@example.com \
     ORYZ_ASSUME_YES=1 \
     ./install.sh --non-interactive
```

See `deploy/answers.example.env` for every available option.

---

## Installing wings-only on a separate server

On the additional machine:

```bash
curl -fsSL https://install.oryz.example/install.sh | sudo bash -s -- --components wings
```

The installer will ask:

- The panel URL this node should register with
- A node name (e.g. `us-east-1`)
- A node token (create one in the panel under **Admin → Nodes → Create Token**)

After install, retrieve the portable node config:

```bash
sudo panelctl wings token
```

Copy the output and paste it into **Admin → Nodes → Register Node** in any Oryz panel.

Each node stores its own server data locally, so:

- If one node goes down, only its servers are affected.
- If the panel goes down, nodes keep running their existing servers.

---

## After installation

1. Open the dashboard URL shown at the end of the installer.
2. Sign in with the administrator email and password.
3. If the password was auto-generated, retrieve it once with:

   ```bash
   sudo panelctl config get-admin-password
   ```

4. Check service health:

   ```bash
   sudo panelctl status
   sudo panelctl doctor
   ```

5. Follow logs:

   ```bash
   sudo panelctl logs -f
   ```

---

## Useful `panelctl` commands

```bash
sudo panelctl status              # service overview
sudo panelctl doctor              # full health check with remedies
sudo panelctl logs -f             # follow panel logs
sudo panelctl update              # upgrade to the latest release
sudo panelctl backup              # create a full backup
sudo panelctl config get KEY      # read a config value
sudo panelctl config set KEY VAL  # write a config value
sudo panelctl wings status        # node daemon status (wings hosts)
```

---

## What gets installed

| Path | Purpose |
|------|---------|
| `/opt/oryz/app` | Application code and build output |
| `/etc/oryz/oryz.env` | Configuration and secrets (`0640 root:oryz`) |
| `/var/lib/oryz` | Storage and state |
| `/var/lib/oryz/backups` | Backup archives (`0700`) |
| `/var/log/oryz` | Service logs, rotated daily for 14 days |
| `/etc/systemd/system/oryz-*.service` | systemd services |
| `/usr/local/bin/panelctl` | Administration CLI |
| `/etc/oryz-wings/config.yml` | Node configuration (wings hosts) |
| `/var/lib/oryz-wings` | Per-node server volumes, backups and state |

The panel runs as the unprivileged system user `oryz`.

---

## Web setup wizard

If the application starts without `SETUP_COMPLETE=true`, it serves a browser-based setup wizard at `/setup`. This is an alternative to the CLI installer and disables itself permanently once finished.

For normal installs, the CLI sets `SETUP_COMPLETE=true` automatically.

---

## Updating

```bash
sudo panelctl update
```

This creates a pre-upgrade backup, fetches the latest release, builds, runs migrations, and rolls back automatically on failure.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Let's Encrypt fails | Confirm the DNS A record resolves to this server and ports 80/443 are open. |
| Database connection error | Check `DATABASE_URL` in `/etc/oryz/oryz.env` and ensure PostgreSQL is running. |
| Services won't start | Run `sudo panelctl doctor` for a diagnosis and suggested remedy. |
| Forgot admin password | Use the password reset flow on the sign-in page, or run `sudo panelctl config get-admin-password` if it was generated. |

For more help, see the full deployment docs in `docs/deployment/`.

---

## Next steps

- [Production hardening](docs/deployment/production.md)
- [Reverse proxy tuning](docs/deployment/reverse-proxy.md)
- [SSL/TLS options](docs/deployment/ssl.md)
- [Backups](docs/deployment/backups.md)
- [Adding nodes](docs/deployment/wings.md)
- [Verification checklist](docs/deployment/verification-checklist.md)
