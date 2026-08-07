/**
 * Panel <-> daemon wire contract.
 *
 * These types are the single source of truth for the future Go/Rust daemon.
 * The mock adapter and the HTTP/WebSocket adapter both implement exactly this
 * surface, so replacing one with the other requires no UI or business-logic
 * change. See docs/daemon-contract.md for the full REST/WS specification.
 */

export type PowerAction = "start" | "stop" | "restart" | "kill";

export type ContainerState =
  | "running"
  | "starting"
  | "stopping"
  | "offline"
  | "installing"
  | "error";

export interface ResourceUsage {
  serverId: string;
  state: ContainerState;
  cpuPercent: number;
  cpuLimitPercent: number;
  memoryBytes: number;
  memoryLimitBytes: number;
  diskBytes: number;
  diskLimitBytes: number;
  networkRxBytes: number;
  networkTxBytes: number;
  uptimeSeconds: number;
  players?: { online: number; max: number } | null;
  sampledAt: string;
}

export interface NodeHealth {
  nodeId: string;
  reachable: boolean;
  version: string;
  dockerVersion: string;
  kernel: string;
  os: string;
  cpuCores: number;
  cpuPercent: number;
  memoryUsedMb: number;
  memoryTotalMb: number;
  diskUsedMb: number;
  diskTotalMb: number;
  containers: { running: number; total: number };
  latencyMs: number;
  lastHeartbeatAt: string;
}

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isSymlink: boolean;
  sizeBytes: number;
  mode: string;
  mimeType: string | null;
  modifiedAt: string;
}

export interface BackupDescriptor {
  id: string;
  name: string;
  bytes: number;
  checksum: string | null;
  progress: number;
  status: "pending" | "running" | "completed" | "failed";
  createdAt: string;
  completedAt: string | null;
}

export interface ConsoleMessage {
  type: "output" | "status" | "stats" | "error";
  line?: string;
  state?: ContainerState;
  stats?: ResourceUsage;
  code?: DaemonErrorCode;
  timestamp: string;
}

export type DaemonErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "node_unreachable"
  | "container_missing"
  | "insufficient_disk"
  | "invalid_request"
  | "rate_limited"
  | "internal";

export class DaemonError extends Error {
  constructor(
    public readonly code: DaemonErrorCode,
    message: string,
    public readonly status = 500,
  ) {
    super(message);
    this.name = "DaemonError";
  }
}

export interface ConsoleSubscription {
  send: (command: string) => void;
  close: () => void;
}

/**
 * The one interface every server operation flows through.
 * UI code never talks HTTP or WebSocket directly.
 */
export interface DaemonClient {
  readonly kind: "mock" | "http";

  // Power + console
  sendPower(serverId: string, action: PowerAction): Promise<void>;
  sendCommand(serverId: string, command: string): Promise<void>;
  subscribeConsole(
    serverId: string,
    handler: (message: ConsoleMessage) => void,
  ): Promise<ConsoleSubscription>;

  // Metrics
  getResourceUsage(serverId: string): Promise<ResourceUsage>;
  getNodeHealth(nodeId: string): Promise<NodeHealth>;

  // Files
  listFiles(serverId: string, path: string): Promise<FileEntry[]>;
  readFile(serverId: string, path: string): Promise<string>;
  writeFile(serverId: string, path: string, contents: string): Promise<void>;
  deleteFiles(serverId: string, paths: string[]): Promise<void>;
  renameFile(serverId: string, from: string, to: string): Promise<void>;
  createDirectory(serverId: string, path: string): Promise<void>;
  compressFiles(serverId: string, paths: string[], archiveName: string): Promise<FileEntry>;
  decompressFile(serverId: string, path: string): Promise<void>;

  // Backups
  createBackup(serverId: string, name: string, ignore?: string): Promise<BackupDescriptor>;
  restoreBackup(serverId: string, backupId: string): Promise<void>;
  deleteBackup(serverId: string, backupId: string): Promise<void>;

  // Lifecycle
  install(serverId: string): Promise<void>;
  reinstall(serverId: string): Promise<void>;
}
