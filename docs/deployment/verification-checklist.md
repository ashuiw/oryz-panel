# Deployment verification checklist

Run through this after a first install, a restore, or a migration to a new
host. `sudo panelctl doctor` covers most of it automatically; the manual items
are marked.

## Automated

```bash
sudo panelctl doctor
```

- [ ] Configuration file present at `/etc/oryz/oryz.env`, mode 0640
- [ ] All required configuration keys populated
- [ ] PostgreSQL reachable, migrations recorded
- [ ] Redis responds to `PING`
- [ ] `oryz-api`, `oryz-web`, `oryz-worker`, `oryz-queue`,
      `oryz-scheduler` all active
- [ ] `/api/health` returns 200 on loopback
- [ ] WebSocket port listening
- [ ] Public URL returns 200/301
- [ ] Storage path writable by `oryz`, disk under 80 %
- [ ] Certificate valid for more than 21 days, auto-renewal enabled
- [ ] Ports 80/443 bound by the proxy, 3000/3001 by the panel
- [ ] App directory owned by `oryz:oryz`, backup directory 0700,
      service account has no login shell

## Manual — functional

- [ ] Dashboard loads over HTTPS with no certificate warning
- [ ] Administrator can sign in
- [ ] Sign out clears the session; protected routes redirect to `/auth`
- [ ] Password reset email arrives (if SMTP is configured)
- [ ] A server console connects and streams output
- [ ] Power actions (start/stop/restart) reach the daemon
- [ ] File manager lists, reads and writes files
- [ ] A backup can be created and downloaded
- [ ] Audit log records the actions you just performed
- [ ] A non-admin user cannot see admin routes
- [ ] `/setup` returns 404 — the wizard disabled itself

## Manual — operational

- [ ] `sudo panelctl backup` succeeds and the archive verifies
- [ ] `sudo panelctl restore` rehearsed on a staging host
- [ ] Nightly backup timer enabled and off-site sync working
- [ ] `sudo systemctl reboot` — all services come back automatically
- [ ] Log rotation configured (`/etc/logrotate.d/oryz`)
- [ ] Monitoring scrapes `/api/health` and alerts on failure

## Manual — security

- [ ] Firewall allows only 22, 80, 443
- [ ] PostgreSQL and Redis are not reachable from the internet
      (`nmap -p 5432,6379 <host>` from elsewhere shows filtered/closed)
- [ ] SSH is key-only, root login disabled
- [ ] `oryz.env` is not world-readable and not in any repository
- [ ] Security headers present:
      `curl -sI https://panel.example.com | grep -Ei 'strict-transport|content-security|x-content-type'`
- [ ] Rate limiting active: repeated auth requests return 429
- [ ] Unattended security updates enabled
- [ ] Generated administrator password retrieved, stored in a password manager
      and erased from the host

## Sign-off

| Field | Value |
| --- | --- |
| Host | |
| Panel version (`panelctl version`) | |
| Domain | |
| Date | |
| Verified by | |
