# Wings — the node daemon

The panel is the web application. **Wings** is the daemon that actually runs
game containers. One wings installation is one **node**.

```text
        ┌───────────┐        ┌──────────────────────────────┐
        │  Panel    │◀──────▶│ node-eu-1  (wings)           │
        │  web UI   │        │  /var/lib/oryz-wings       │
        │  Postgres │        │  its own docker + state db   │
        └───────────┘        └──────────────────────────────┘
              ▲              ┌──────────────────────────────┐
              └─────────────▶│ node-us-1  (wings)           │
                             └──────────────────────────────┘
```

## Isolation guarantees

- **Every node owns its servers' data.** Volumes, backups and the local state
  database live under that node's `data_dir`. Nodes never read each other's
  data and never talk to each other.
- **A node failing affects only its own servers.** The panel marks that node
  offline; servers on every other node keep running and stay controllable.
- **A panel failing does not stop game servers.** Containers run with
  `restart_policy: unless-stopped` and wings reconciles them from its local
  state database, with `offline_grace_seconds: 0` meaning "run indefinitely
  without the panel". While the panel is down you lose the web UI, scheduling
  and cross-node operations — not the running servers. When the panel comes
  back, each node re-syncs its state.

## Installing

Wings is one of the three installer choices:

```bash
sudo ./install.sh            # then pick: panel+wings | panel | wings
```

Unattended:

```bash
sudo ./install.sh --non-interactive --components wings \
     --wings-panel https://panel.example.com --node-name node-eu-1
```

The installer installs Docker, creates the `oryz-wings` account and data
tree, writes `/etc/oryz-wings/config.yml` (mode 0640) and registers
`oryz-wings.service`.

## Attaching a node to a panel

A wings-only host is **panel-agnostic**: it can be registered with any Oryz
panel, not just one on the same machine.

1. At the end of the install, copy the printed node configuration blob.
2. In the panel, go to **Admin → Nodes → Add node → Paste node configuration**
   and paste it. The blob carries the node UUID, FQDN, scheme, ports, token id,
   token and capacity — nothing panel-specific.
3. The node appears once its first heartbeat arrives.

To move a node to a different panel, change `remote.url` in
`/etc/oryz-wings/config.yml`, restart `oryz-wings`, and register the same
blob on the new panel. Running servers are untouched.

## Ports

| Port | Purpose |
| --- | --- |
| 8080 | daemon API and console WebSocket (panel → node) |
| 2022 | SFTP for server files |
| your range | game ports, exposed to players |

## Operating

```bash
systemctl status oryz-wings
journalctl -u oryz-wings -f
sudo nano /etc/oryz-wings/config.yml && systemctl restart oryz-wings
```

Restarting wings does not stop game containers.

## Security notes

- `config.yml` contains the node token — treat it like a password. Rotate by
  issuing a new token in the panel and updating the file.
- Terminate TLS in front of the daemon (or set `scheme: https` with a real
  certificate); the panel refuses plaintext daemon endpoints on public FQDNs.
- Only the panel needs to reach port 8080; firewall it accordingly.
