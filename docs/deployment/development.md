# Development setup

You do not need the installer to work on the panel. It targets production
hosts; local development runs the app directly.

## Requirements

- Node.js 22+
- pnpm 9+ (`corepack enable`)
- PostgreSQL 15+ and Redis 7+ (or Docker)

## Quick start

```bash
git clone https://github.com/oryz-panel/oryz.git
cd oryz
pnpm install
cp deploy/templates/env/oryz.env.template .env
pnpm run dev
```

Generate the secrets your local `.env` needs:

```bash
for k in JWT_SECRET JWT_REFRESH_SECRET SESSION_SECRET API_SIGNING_SECRET; do
  echo "$k=$(openssl rand -base64 48 | tr -d '\n=' | tr '+/' '-_')"
done
echo "ENCRYPTION_KEY=$(openssl rand -hex 32)"
```

## Dependencies via Docker

```bash
docker run -d --name oryz-pg -e POSTGRES_PASSWORD=oryz \
  -e POSTGRES_USER=oryz -e POSTGRES_DB=oryz -p 5432:5432 postgres:16
docker run -d --name oryz-redis -p 6379:6379 redis:7
```

## Testing the installer safely

Never run `install.sh` on your workstation — it creates system users, writes to
`/etc` and registers systemd units. Use a throwaway VM or a systemd-enabled
container:

```bash
# fresh VM (multipass example)
multipass launch 24.04 --name oryz-test --cpus 2 --memory 4G --disk 20G
multipass transfer -r . oryz-test:/home/ubuntu/oryz
multipass exec oryz-test -- sudo bash -c \
  'cd /home/ubuntu/oryz/deploy && ./install.sh --source /home/ubuntu/oryz \
     --domain oryz.local --ssl selfsigned --admin-email dev@example.com -y'
```

`--source DIR` installs from a local tree instead of downloading a release,
which is what you want when testing installer changes.

## Installer layout

```text
deploy/
  install.sh              orchestrator, argument parsing, summary
  upgrade.sh              upgrade with automatic rollback
  panelctl                administration CLI
  answers.example.env     unattended answers template
  lib/
    common.sh             logging, prompts, validation, secrets, env I/O
    preflight.sh          OS detection, hardware and conflict checks
    deps.sh               dependency detection and installation
    config.sh             question flow and oryz.env generation
    database.sh           provisioning, migrations, seeding, admin bootstrap
    build.sh              source acquisition and production build
    proxy.sh              nginx / Caddy / Traefik rendering
    ssl.sh                certificate issuance and renewal
    services.sh           systemd unit installation and lifecycle
    verify.sh             post-install verification and `doctor` checks
    backup.sh             backup, restore, prune
  templates/
    systemd/  nginx/  caddy/  traefik/  env/
```

### Conventions

- Every module is idempotent: re-running the installer must be safe.
- Nothing is written before the review screen is confirmed.
- Secrets never reach stdout or `/var/log/oryz/install.log`; use `redact()`.
- Every prompt maps to one environment variable so runs are reproducible.
- User input is validated with the `valid_*` helpers before use.
- Failures in `doctor` always print a concrete remediation command.

### Adding a distribution

1. Add an entry to `SUPPORTED_MATRIX` in `lib/preflight.sh`.
2. If package names or the package manager differ, add a branch to
   `pkg_install` in `lib/deps.sh`.
3. Test a clean install in a VM and run `panelctl doctor`.

### Shell style

`set -Eeuo pipefail` everywhere, `local` for all function variables, quote
every expansion. Lint before opening a pull request:

```bash
shellcheck deploy/install.sh deploy/upgrade.sh deploy/panelctl deploy/lib/*.sh
```
