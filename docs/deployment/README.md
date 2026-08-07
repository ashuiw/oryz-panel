# Deployment documentation

Everything needed to run Oryz Panel on your own infrastructure.

| Document | Contents |
| --- | --- |
| [Installation](installation.md) | Supported systems, requirements, interactive and unattended installs |
| [Wings (nodes)](wings.md) | Node daemon: wings-only installs, attaching to any panel, isolation guarantees |
| [Setup wizard](setup-wizard.md) | Browser-based first-run configuration |

| [Updating](updating.md) | `panelctl update`, rollback, migration workflow |
| [Backups](backups.md) | What is backed up, scheduling, off-site copies, restore |
| [Uninstalling](uninstalling.md) | Clean removal, with or without data |
| [Reverse proxy](reverse-proxy.md) | nginx, Caddy, Traefik, terminating TLS upstream |
| [SSL](ssl.md) | Let's Encrypt, existing certificates, self-signed, renewal |
| [Production](production.md) | Topology, sizing, hardening, monitoring, maintenance |
| [Troubleshooting](troubleshooting.md) | Symptom-driven fixes and log locations |
| [Development](development.md) | Local setup and installer internals |
| [Verification checklist](verification-checklist.md) | Post-deployment sign-off |

## Thirty-second version

```bash
git clone https://github.com/oryz-panel/oryz.git
cd oryz/deploy && sudo ./install.sh
```

## panelctl reference

| Command | Description |
| --- | --- |
| `panelctl install` | run the installer |
| `panelctl update` | upgrade with backup and automatic rollback |
| `panelctl uninstall [--purge]` | remove the panel, optionally all data |
| `panelctl doctor` | health check with actionable remedies |
| `panelctl status` | service overview |
| `panelctl start\|stop\|restart` | control all services |
| `panelctl backup [--list\|--prune N]` | create, list or prune backups |
| `panelctl restore ARCHIVE` | restore from a backup |
| `panelctl logs [-f] [unit]` | view logs |
| `panelctl config get\|set\|list\|edit` | inspect and change configuration |
| `panelctl ssl renew\|status` | certificate management |
| `panelctl cache:clear` | clear build and application caches |
| `panelctl queue:restart` | restart queue and background workers |
| `panelctl version` | version information |
