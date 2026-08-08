/**
 * Node (wings) registration helpers.
 *
 * A node is autonomous: it holds its own database, volumes and backups, and it
 * keeps its containers running when the panel is unreachable. Everything it
 * needs to attach to a panel lives in the generated `config.yml` below, so the
 * same node can be pointed at any panel by editing `remote.url`.
 */

export interface NodeConfigInput {
  id: string;
  name: string;
  fqdn: string;
  scheme: string;
  daemon_port: number;
  daemon_sftp_port: number;
  daemon_token_id: string | null;
  daemon_token: string | null;
  memory_mb: number;
  disk_mb: number;
}

/** Panel origin the node reports back to. */
export function panelOrigin(): string {
  if (typeof window === "undefined") return "https://panel.example.com";
  return window.location.origin;
}

export function buildNodeConfig(node: NodeConfigInput, panelUrl = panelOrigin()): string {
  return `# Oryz Panel — node configuration
# Generated for "${node.name}". Save as /etc/oryz-wings/config.yml on the node.
uuid: ${node.id}
name: ${node.name}

api:
  host: 0.0.0.0
  port: ${node.daemon_port}
  scheme: ${node.scheme}
  public_fqdn: ${node.fqdn}
  upload_limit_mb: 256

sftp:
  bind: 0.0.0.0
  port: ${node.daemon_sftp_port}

remote:
  url: ${panelUrl}
  token_id: ${node.daemon_token_id ?? ""}
  token: ${node.daemon_token ?? ""}
  timeout_seconds: 15
  # 0 = never stop servers because the panel is unreachable.
  offline_grace_seconds: 0

system:
  data_dir: /var/lib/oryz-wings
  volume_dir: /var/lib/oryz-wings/volumes
  backup_dir: /var/lib/oryz-wings/backups
  state_dir: /var/lib/oryz-wings/state
  log_dir: /var/log/oryz-wings
  username: oryz-wings
  timezone: UTC
  check_permissions_on_boot: true
  database: /var/lib/oryz-wings/state/wings.db

docker:
  network:
    name: oryz0
    driver: bridge
    interface: 172.21.0.1
    enable_icc: false
  restart_policy: unless-stopped
  tmpfs_size_mb: 128
  container_pid_limit: 512

capacity:
  memory_mb: ${node.memory_mb}
  disk_mb: ${node.disk_mb}
  memory_overallocate: 0
  disk_overallocate: 0

throttles:
  console_lines_per_interval: 2000
  console_interval_ms: 100

allowed_origins: []
`;
}

/** One-liner the operator runs on the node host to apply the config above. */
export function nodeInstallCommand(node: NodeConfigInput, panelUrl = panelOrigin()): string {
  return [
    "sudo panelctl wings apply --panel " + panelUrl,
    "  --token-id " + (node.daemon_token_id ?? ""),
    "  --token " + (node.daemon_token ?? ""),
    "  --uuid " + node.id,
  ].join(" \\\n");
}

/** Bootstrap command for a host that has nothing installed yet. */
export function nodeBootstrapCommand(): string {
  return "curl -fsSL https://raw.githubusercontent.com/oryz-panel/oryz/main/deploy/install.sh | sudo bash -s -- --components wings";
}
