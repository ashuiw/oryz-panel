# Web setup wizard

When the application starts without a completed configuration
(`SETUP_COMPLETE=false` in `oryz.env`, or no configuration at all), it serves
a browser-based wizard at `/setup`. It covers the same ground as the shell
installer for administrators who prefer a UI, or for container deployments
where the shell installer does not apply.

## Steps

1. **System check** — runtime version, database reachability, Redis
   reachability, writable storage, present secrets. Blocking problems must be
   resolved before continuing.
2. **Database** — host, port, name, user, password; the connection is tested
   before the step advances.
3. **Redis** — host, port, optional password, database index; tested live.
4. **Storage** — local path or S3-compatible bucket credentials.
5. **Email** — SMTP host, port, encryption, credentials, sender identity.
   Skippable, with a warning that password resets will not be delivered.
6. **Administrator** — email, display name, password (minimum 12 characters,
   confirmed).
7. **Finish** — writes the configuration, runs migrations, seeds reference
   data, creates the administrator and marks setup complete.

## Self-disabling

On success the wizard sets `SETUP_COMPLETE=true`. Every subsequent request to
`/setup` returns 404, and the route refuses to run any step even if called
directly. This is deliberate: an open setup wizard on a live panel is a
complete account takeover.

To re-run it intentionally:

```bash
sudo panelctl config set SETUP_COMPLETE false
sudo panelctl restart
```

Do this only on a host you control, and only long enough to finish setup.

## Security

- The wizard is only reachable while setup is incomplete.
- Secrets are generated server-side; the browser never chooses them.
- Entered credentials are validated server-side and written straight to
  `oryz.env` at 0640; they are never echoed back to the client.
- Connection tests report only success or a sanitised error, never the
  credentials involved.
- Bind the panel to loopback and reach the wizard through an SSH tunnel if the
  host is internet-facing before TLS is configured:

  ```bash
  ssh -L 3000:127.0.0.1:3000 admin@your-host
  # then open http://127.0.0.1:3000/setup
  ```

## When to prefer the shell installer

The wizard configures the application. It does **not** install PostgreSQL,
Redis or a reverse proxy, issue certificates, or register systemd services —
those need root on the host. On a fresh VPS, run `install.sh`.
