# Fix strict-mode installer counter failures

## What is wrong

The migration itself is not failing. The existing `schema_migrations` row enters the “already applied” branch at `deploy/lib/database.sh:118`, where `((skipped++))` evaluates to zero on its first use. Bash treats that arithmetic result as exit status 1, and the installer's `set -e` immediately aborts.

The same unsafe post-increment pattern also exists in migration success counting, backup pruning, preflight counters, and doctor counters, so fixing only line 118 would allow similar unexplained exits later.

## Changes

1. Replace every standalone post-increment in deployment scripts with strict-mode-safe arithmetic assignment, such as `((skipped += 1))`.
2. Keep migration checksum and idempotency behavior unchanged: previously applied migrations remain skipped, and new migrations remain recorded normally.
3. Add a shell regression check that exercises both a skipped migration and a newly applied migration under `set -Eeuo pipefail`.
4. Review the resulting installer flow for any remaining arithmetic commands whose zero result can accidentally terminate installation.

## Recovery instructions

After pulling the fixed source, rerun the installer normally; the database bootstrap and migrations are designed to be idempotent, so no database cleanup is required.

This error does not require a permission command. If an interrupted earlier installation left filesystem ownership inconsistent and `panelctl` is already installed, the optional repair command is:

```bash
sudo panelctl permissions:repair
```

If `panelctl` was not installed yet, simply rerunning the corrected installer will normalize application permissions during the source/build stages.