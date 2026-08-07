import {
  DaemonError,
  type BackupDescriptor,
  type ConsoleMessage,
  type ConsoleSubscription,
  type ContainerState,
  type DaemonClient,
  type FileEntry,
  type NodeHealth,
  type PowerAction,
  type ResourceUsage,
} from "./types";

/**
 * Local in-memory adapter.
 *
 * It exists so the panel is fully interactive before any daemon is deployed.
 * It implements the exact same contract as the HTTP adapter — swapping the two
 * is a one-line change in `src/daemon/index.ts`.
 */

interface MockServerState {
  state: ContainerState;
  startedAt: number;
  cpu: number;
  memory: number;
  disk: number;
  rx: number;
  tx: number;
  files: Map<string, FileEntry & { contents?: string }>;
  backups: BackupDescriptor[];
  listeners: Set<(message: ConsoleMessage) => void>;
  buffer: string[];
}

const BOOT_LINES = [
  "[Daemon] Container created, attaching to stdio stream",
  "[Daemon] Pulling image manifest (cached)",
  "[Server] Loading configuration from server.properties",
  "[Server] Preparing level assets",
  "[Server] Listening on 0.0.0.0:25565",
  "[Server] Done — server marked healthy",
];

function nowIso() {
  return new Date().toISOString();
}

function seedFiles(): Map<string, FileEntry & { contents?: string }> {
  const files = new Map<string, FileEntry & { contents?: string }>();
  const add = (
    path: string,
    isDirectory: boolean,
    sizeBytes: number,
    contents?: string,
    mimeType: string | null = null,
  ) => {
    const name = path.split("/").filter(Boolean).pop() ?? "/";
    files.set(path, {
      name,
      path,
      isDirectory,
      isSymlink: false,
      sizeBytes,
      mode: isDirectory ? "drwxr-xr-x" : "-rw-r--r--",
      mimeType,
      modifiedAt: nowIso(),
      ...(contents === undefined ? {} : { contents }),
    });
  };

  add("/plugins", true, 0);
  add("/logs", true, 0);
  add("/world", true, 0);
  add(
    "/server.properties",
    false,
    1284,
    "motd=A Oryz managed server\nmax-players=64\nonline-mode=true\nview-distance=10\n",
    "text/plain",
  );
  add("/eula.txt", false, 164, "eula=true\n", "text/plain");
  add(
    "/start.sh",
    false,
    302,
    '#!/bin/sh\nexec java -Xms1024M -Xmx{{SERVER_MEMORY}}M -jar server.jar nogui\n',
    "text/x-shellscript",
  );
  return files;
}

class MockDaemonClient implements DaemonClient {
  readonly kind = "mock" as const;
  private servers = new Map<string, MockServerState>();
  private ticker: ReturnType<typeof setInterval> | null = null;

  private state(serverId: string): MockServerState {
    let existing = this.servers.get(serverId);
    if (!existing) {
      existing = {
        state: "offline",
        startedAt: 0,
        cpu: 0,
        memory: 0,
        disk: 1024 * 1024 * 640,
        rx: 0,
        tx: 0,
        files: seedFiles(),
        backups: [],
        listeners: new Set(),
        buffer: [],
      };
      this.servers.set(serverId, existing);
    }
    return existing;
  }

  private emit(serverId: string, message: ConsoleMessage) {
    const state = this.state(serverId);
    if (message.line) {
      state.buffer.push(message.line);
      if (state.buffer.length > 500) state.buffer.shift();
    }
    state.listeners.forEach((listener) => listener(message));
  }

  private ensureTicker() {
    if (this.ticker) return;
    this.ticker = setInterval(() => {
      for (const [serverId, state] of this.servers) {
        if (state.state !== "running") continue;
        state.cpu = Math.max(4, Math.min(96, state.cpu + (Math.random() - 0.5) * 14));
        state.memory = Math.max(
          220 * 1024 * 1024,
          Math.min(1600 * 1024 * 1024, state.memory + (Math.random() - 0.5) * 90 * 1024 * 1024),
        );
        state.rx += Math.floor(Math.random() * 90_000);
        state.tx += Math.floor(Math.random() * 140_000);
        if (state.listeners.size > 0) {
          void this.getResourceUsage(serverId).then((stats) =>
            this.emit(serverId, { type: "stats", stats, timestamp: nowIso() }),
          );
        }
      }
    }, 2000);
  }

  async sendPower(serverId: string, action: PowerAction): Promise<void> {
    const state = this.state(serverId);
    if (action === "start" || action === "restart") {
      state.state = "starting";
      this.emit(serverId, { type: "status", state: "starting", timestamp: nowIso() });
      for (const [index, line] of BOOT_LINES.entries()) {
        setTimeout(() => this.emit(serverId, { type: "output", line, timestamp: nowIso() }), 260 * (index + 1));
      }
      setTimeout(() => {
        state.state = "running";
        state.startedAt = Date.now();
        state.cpu = 22;
        state.memory = 780 * 1024 * 1024;
        this.emit(serverId, { type: "status", state: "running", timestamp: nowIso() });
      }, 260 * (BOOT_LINES.length + 1));
      return;
    }

    state.state = "stopping";
    this.emit(serverId, { type: "status", state: "stopping", timestamp: nowIso() });
    this.emit(serverId, {
      type: "output",
      line: action === "kill" ? "[Daemon] SIGKILL sent to container" : "[Server] Stopping the server",
      timestamp: nowIso(),
    });
    setTimeout(
      () => {
        state.state = "offline";
        state.cpu = 0;
        state.memory = 0;
        state.startedAt = 0;
        this.emit(serverId, { type: "status", state: "offline", timestamp: nowIso() });
      },
      action === "kill" ? 120 : 900,
    );
  }

  async sendCommand(serverId: string, command: string): Promise<void> {
    const state = this.state(serverId);
    if (state.state !== "running") {
      throw new DaemonError("conflict", "Server is not running", 409);
    }
    this.emit(serverId, { type: "output", line: `> ${command}`, timestamp: nowIso() });
    setTimeout(
      () =>
        this.emit(serverId, {
          type: "output",
          line: `[Server] Unknown or unhandled command "${command.split(" ")[0]}"`,
          timestamp: nowIso(),
        }),
      220,
    );
  }

  async subscribeConsole(
    serverId: string,
    handler: (message: ConsoleMessage) => void,
  ): Promise<ConsoleSubscription> {
    const state = this.state(serverId);
    this.ensureTicker();
    state.listeners.add(handler);
    state.buffer.forEach((line) => handler({ type: "output", line, timestamp: nowIso() }));
    handler({ type: "status", state: state.state, timestamp: nowIso() });

    return {
      send: (command: string) => void this.sendCommand(serverId, command).catch(() => undefined),
      close: () => {
        state.listeners.delete(handler);
      },
    };
  }

  async getResourceUsage(serverId: string): Promise<ResourceUsage> {
    const state = this.state(serverId);
    return {
      serverId,
      state: state.state,
      cpuPercent: Number(state.cpu.toFixed(1)),
      cpuLimitPercent: 200,
      memoryBytes: Math.round(state.memory),
      memoryLimitBytes: 2048 * 1024 * 1024,
      diskBytes: state.disk,
      diskLimitBytes: 10 * 1024 * 1024 * 1024,
      networkRxBytes: state.rx,
      networkTxBytes: state.tx,
      uptimeSeconds: state.startedAt ? Math.floor((Date.now() - state.startedAt) / 1000) : 0,
      players: state.state === "running" ? { online: 12, max: 64 } : null,
      sampledAt: nowIso(),
    };
  }

  async getNodeHealth(nodeId: string): Promise<NodeHealth> {
    return {
      nodeId,
      reachable: true,
      version: "0.1.0-mock",
      dockerVersion: "27.3.1",
      kernel: "6.8.0-45-generic",
      os: "Ubuntu 24.04.1 LTS",
      cpuCores: 16,
      cpuPercent: 34.2,
      memoryUsedMb: 24_192,
      memoryTotalMb: 65_536,
      diskUsedMb: 412_000,
      diskTotalMb: 1_920_000,
      containers: { running: 18, total: 24 },
      latencyMs: 12,
      lastHeartbeatAt: nowIso(),
    };
  }

  async listFiles(serverId: string, path: string): Promise<FileEntry[]> {
    const state = this.state(serverId);
    const normalized = path === "" ? "/" : path.replace(/\/+$/, "") || "/";
    return [...state.files.values()]
      .filter((entry) => {
        const parent = entry.path.slice(0, entry.path.lastIndexOf("/")) || "/";
        return parent === normalized;
      })
      .map(({ contents: _contents, ...entry }) => entry)
      .sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory) || a.name.localeCompare(b.name));
  }

  async readFile(serverId: string, path: string): Promise<string> {
    const entry = this.state(serverId).files.get(path);
    if (!entry || entry.isDirectory) throw new DaemonError("not_found", `No such file: ${path}`, 404);
    return entry.contents ?? "";
  }

  async writeFile(serverId: string, path: string, contents: string): Promise<void> {
    const state = this.state(serverId);
    const existing = state.files.get(path);
    state.files.set(path, {
      name: path.split("/").pop() ?? path,
      path,
      isDirectory: false,
      isSymlink: false,
      sizeBytes: contents.length,
      mode: existing?.mode ?? "-rw-r--r--",
      mimeType: existing?.mimeType ?? "text/plain",
      modifiedAt: nowIso(),
      contents,
    });
  }

  async deleteFiles(serverId: string, paths: string[]): Promise<void> {
    const state = this.state(serverId);
    paths.forEach((path) => state.files.delete(path));
  }

  async renameFile(serverId: string, from: string, to: string): Promise<void> {
    const state = this.state(serverId);
    const entry = state.files.get(from);
    if (!entry) throw new DaemonError("not_found", `No such file: ${from}`, 404);
    state.files.delete(from);
    state.files.set(to, { ...entry, path: to, name: to.split("/").pop() ?? to, modifiedAt: nowIso() });
  }

  async createDirectory(serverId: string, path: string): Promise<void> {
    const state = this.state(serverId);
    state.files.set(path, {
      name: path.split("/").pop() ?? path,
      path,
      isDirectory: true,
      isSymlink: false,
      sizeBytes: 0,
      mode: "drwxr-xr-x",
      mimeType: null,
      modifiedAt: nowIso(),
    });
  }

  async compressFiles(serverId: string, paths: string[], archiveName: string): Promise<FileEntry> {
    const state = this.state(serverId);
    const entry: FileEntry = {
      name: archiveName,
      path: `/${archiveName}`,
      isDirectory: false,
      isSymlink: false,
      sizeBytes: paths.length * 1024 * 512,
      mode: "-rw-r--r--",
      mimeType: "application/zip",
      modifiedAt: nowIso(),
    };
    state.files.set(entry.path, entry);
    return entry;
  }

  async decompressFile(): Promise<void> {
    // no-op in the mock adapter
  }

  async createBackup(serverId: string, name: string): Promise<BackupDescriptor> {
    const state = this.state(serverId);
    const backup: BackupDescriptor = {
      id: crypto.randomUUID(),
      name,
      bytes: 0,
      checksum: null,
      progress: 0,
      status: "running",
      createdAt: nowIso(),
      completedAt: null,
    };
    state.backups.unshift(backup);
    let progress = 0;
    const interval = setInterval(() => {
      progress += 12;
      backup.progress = Math.min(100, progress);
      if (progress >= 100) {
        clearInterval(interval);
        backup.status = "completed";
        backup.bytes = 512 * 1024 * 1024;
        backup.checksum = crypto.randomUUID().replace(/-/g, "");
        backup.completedAt = nowIso();
      }
    }, 500);
    return backup;
  }

  async restoreBackup(serverId: string): Promise<void> {
    this.emit(serverId, { type: "output", line: "[Daemon] Restoring backup archive", timestamp: nowIso() });
  }

  async deleteBackup(serverId: string, backupId: string): Promise<void> {
    const state = this.state(serverId);
    state.backups = state.backups.filter((backup) => backup.id !== backupId);
  }

  async install(serverId: string): Promise<void> {
    const state = this.state(serverId);
    state.state = "installing";
    this.emit(serverId, { type: "status", state: "installing", timestamp: nowIso() });
    setTimeout(() => {
      state.state = "offline";
      this.emit(serverId, { type: "status", state: "offline", timestamp: nowIso() });
    }, 2500);
  }

  async reinstall(serverId: string): Promise<void> {
    return this.install(serverId);
  }
}

export function createMockDaemonClient(): DaemonClient {
  return new MockDaemonClient();
}
