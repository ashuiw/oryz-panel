# Backups and restore

## What a backup contains

| Component | Included |
| --- | --- |
| PostgreSQL database | `pg_dump` custom-format dump |
| Configuration | `/etc/oryz/oryz.env` |
| Reverse proxy config | nginx site or Caddyfile |
| systemd units | all `oryz-*.service` files |
| Local storage / uploads | tar of `STORAGE_PATH` |
| Manifest | version, host, timestamp, storage driver |

Archives are written to `/var/lib/oryz/backups` at mode 0600 inside a 0700
directory, with a `.sha256` sidecar. **They contain secrets** — treat them as
sensitive and encrypt them before moving them off-host.

## Creating a backup

```bash
sudo panelctl backup                       # label: manual
sudo panelctl backup --label nightly
sudo panelctl backup --list
sudo panelctl backup --prune 10            # keep the 10 newest
```

The updater creates a `pre-upgrade` backup automatically, and `panelctl
uninstall` (without `--purge`) creates a `pre-uninstall` one.

## Scheduling

```bash
sudo tee /etc/systemd/system/oryz-backup.service >/dev/null <<'EOF'
[Unit]
Description=Oryz Panel nightly backup

[Service]
Type=oneshot
ExecStart=/usr/local/bin/panelctl backup --label nightly
ExecStartPost=/usr/local/bin/panelctl backup --prune 14
EOF

sudo tee /etc/systemd/system/oryz-backup.timer >/dev/null <<'EOF'
[Unit]
Description=Nightly Oryz Panel backup

[Timer]
OnCalendar=*-*-* 03:30:00
RandomizedDelaySec=15m
Persistent=true

[Install]
WantedBy=timers.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now oryz-backup.timer
```

## Off-site copies

A backup on the same disk is not a backup. Sync the directory somewhere else,
encrypting in transit and at rest:

```bash
# rclone to any S3-compatible bucket, server-side encrypted
rclone sync /var/lib/oryz/backups remote:oryz-backups --transfers 2
```

Keep at least: 7 daily, 4 weekly, 3 monthly. Verify restores quarterly.

## Restoring

```bash
sudo panelctl backup --list
sudo panelctl restore oryz-nightly-20260807-033000.tar.gz
```

The restore:

1. Verifies the SHA-256 checksum and archive integrity, refusing corrupt files.
2. Prints the manifest and asks for confirmation.
3. Stops all services.
4. Backs up the current configuration to `*.pre-restore.<timestamp>`.
5. Restores configuration, database (`pg_restore --clean --if-exists`) and
   storage.
6. Restarts services.

Afterwards:

```bash
sudo panelctl doctor
```

## Restoring onto a new host

1. Install the panel on the new host with the same domain and version.
2. Copy the archive into `/var/lib/oryz/backups`.
3. `sudo panelctl restore <archive>`.
4. Re-issue TLS certificates: `sudo panelctl ssl renew`.
5. Update DNS to the new host, then run `sudo panelctl doctor`.

Because the archive carries the original `oryz.env`, encryption keys survive
the move and stored secrets stay readable. If you deliberately rotate
`ENCRYPTION_KEY`, previously encrypted values become unreadable.

## Manual database-only operations

```bash
# dump
sudo -u postgres pg_dump -Fc oryz > oryz.dump

# restore
sudo -u postgres pg_restore --clean --if-exists -d oryz oryz.dump
```
