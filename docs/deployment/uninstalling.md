# Uninstalling

## Keep the data

```bash
sudo panelctl uninstall
```

Creates a `pre-uninstall` backup, then removes: systemd units, log rotation,
reverse proxy configuration, `/opt/oryz/app` and `/usr/local/bin/panelctl`.

Kept: the database and role, `/etc/oryz/oryz.env`, `/var/lib/oryz`
(storage and backups) and the `oryz` system user. Re-running the installer
picks these back up.

## Remove everything

```bash
sudo panelctl uninstall --purge
```

Additionally drops the database and database role, and deletes
`/var/lib/oryz` (**including all backups**), `/etc/oryz`, `/var/log/oryz`
and the `oryz` user and group. Two separate confirmations are required and
there is no recovery.

Copy anything you want to keep first:

```bash
sudo panelctl backup --label final
sudo cp /var/lib/oryz/backups/oryz-final-*.tar.gz /root/
```

## Leftovers you may want to clean up

The uninstaller intentionally does not touch shared system software, since
other services may depend on it:

```bash
sudo apt-get purge postgresql redis-server nginx nodejs   # only if nothing else uses them
sudo rm -f /etc/apt/sources.list.d/nodesource.list
sudo certbot delete --cert-name panel.example.com          # remove the certificate
sudo rm -f /etc/letsencrypt/renewal-hooks/deploy/oryz-reload.sh
```

Also remove the DNS record and any firewall rules you added for the panel.
