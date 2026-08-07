# Updating

```bash
sudo panelctl update
```

## What it does

1. Compares the installed version with the release manifest.
2. Creates a full backup: database dump, configuration, proxy config, systemd
   units and local storage.
3. Snapshots `/opt/oryz/app` for instant file rollback.
4. Stops the services.
5. Downloads and unpacks the new release.
6. Installs dependencies and rebuilds production assets.
7. Applies pending migrations.
8. Re-seeds reference data (idempotent).
9. Restarts services and waits for them to become healthy.
10. Runs verification (database, Redis, HTTP health, storage).
11. Prunes old backups, keeping the ten most recent.

## Rollback

Any failure after the services stop triggers an automatic rollback: the file
snapshot is put back, the pre-upgrade backup is restored, and the services are
restarted on the previous version. The backup archive is kept either way, so
you can also roll back manually later:

```bash
sudo panelctl restore oryz-pre-upgrade-20260807-101500.tar.gz
```

## Useful variants

```bash
sudo panelctl update --check          # report whether an update exists, change nothing
sudo panelctl update --migrate-only   # apply pending migrations and restart only
sudo panelctl update --force          # reinstall the current version
sudo panelctl update -y               # no confirmation prompts
```

## Migration workflow

Migrations are plain SQL files in `supabase/migrations/`, applied in lexical
order. Each runs in a single transaction and is recorded in
`schema_migrations` with a SHA-256 checksum, so:

- re-running the installer or updater never re-applies a migration;
- editing an already applied migration produces a warning rather than silent
  divergence — write a new migration instead;
- a failed migration rolls back completely, leaving the schema untouched.

Naming: `YYYYMMDDHHMMSS_short_description.sql`.

Write migrations to be forward-only and additive where possible. For a
destructive change, ship it as two releases: add the new shape and backfill
first, drop the old shape in the following release. That keeps a rollback
during the upgrade window safe.

## Zero-surprise upgrades

Before upgrading a production host:

```bash
sudo panelctl doctor        # start from a healthy baseline
sudo panelctl backup --label pre-upgrade-manual
```

Read the release notes for breaking changes, and test the upgrade on a staging
copy restored from a production backup when the release touches the schema.

## Keeping the OS updated

The installer does not manage OS packages after installation. Apply security
updates on your normal schedule; restart the panel afterwards with
`sudo panelctl restart`.
