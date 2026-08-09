import {
  DaemonError,
  type BackupDescriptor,
  type ConsoleMessage,
  type ConsoleSubscription,
  type DaemonClient,
  type DaemonErrorCode,
  type FileEntry,
  type NodeHealth,
  type PowerAction,
  type ResourceUsage,
} from "./types";

/**
 * Real daemon adapter (HTTP + WebSocket).
 *
 * Wire format is documented in docs/daemon-contract.md. The panel mints a
 * short-lived JWT per server/node and the daemon verifies it against the
 * shared signing key before opening any stream.
 *
 * Not active yet: `src/daemon/index.ts` selects the mock adapter until a
 * daemon fleet is deployed. Turning it on is a configuration change only.
 */

export interface HttpDaemonConfig {
  /** e.g. https://node-fra-01.example.com:8080 */
  baseUrl: string;
  /** Callback that returns a fresh panel-signed JWT for the given scope. */
  getToken: (scope: { serverId?: string; nodeId?: string }) => Promise<string>;
  timeoutMs?: number;
}

export class HttpDaemonClient implements DaemonClient {
  readonly kind = "http" as const;

  constructor(private readonly config: HttpDaemonConfig) {}

  private async request<T>(
    path: string,
    init: RequestInit & { serverId?: string; nodeId?: string } = {},
  ): Promise<T> {
    const { serverId, nodeId, ...requestInit } = init;
    const scope: { serverId?: string; nodeId?: string } = {};
    if (serverId) scope.serverId = serverId;
    if (nodeId) scope.nodeId = nodeId;
    const token = await this.config.getToken(scope);

    const response = await fetch(`${this.config.baseUrl}${path}`, {
      ...requestInit,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        ...(requestInit.headers ?? {}),
      },
      signal: AbortSignal.timeout(this.config.timeoutMs ?? 10_000),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as {
        code?: DaemonErrorCode;
        message?: string;
      };
      throw new DaemonError(
        payload.code ?? "internal",
        payload.message ?? response.statusText,
        response.status,
      );
    }

    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  sendPower(serverId: string, action: PowerAction): Promise<void> {
    return this.request(`/api/servers/${serverId}/power`, {
      method: "POST",
      body: JSON.stringify({ action }),
      serverId,
    });
  }

  sendCommand(serverId: string, command: string): Promise<void> {
    return this.request(`/api/servers/${serverId}/command`, {
      method: "POST",
      body: JSON.stringify({ command }),
      serverId,
    });
  }

  async subscribeConsole(
    serverId: string,
    handler: (message: ConsoleMessage) => void,
  ): Promise<ConsoleSubscription> {
    const token = await this.config.getToken({ serverId });
    const url = new URL(`/api/servers/${serverId}/ws`, this.config.baseUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(url.toString(), ["oryz.v1", `bearer.${token}`]);

    socket.addEventListener("message", (event) => {
      try {
        handler(JSON.parse(event.data as string) as ConsoleMessage);
      } catch {
        handler({ type: "error", code: "invalid_request", timestamp: new Date().toISOString() });
      }
    });
    socket.addEventListener("error", () =>
      handler({ type: "error", code: "node_unreachable", timestamp: new Date().toISOString() }),
    );

    return {
      send: (command: string) => socket.send(JSON.stringify({ type: "command", command })),
      close: () => socket.close(),
    };
  }

  getResourceUsage(serverId: string): Promise<ResourceUsage> {
    return this.request(`/api/servers/${serverId}/resources`, { serverId });
  }

  getNodeHealth(nodeId: string): Promise<NodeHealth> {
    return this.request(`/api/system/health`, { nodeId });
  }

  listFiles(serverId: string, path: string): Promise<FileEntry[]> {
    return this.request(`/api/servers/${serverId}/files/list?path=${encodeURIComponent(path)}`, {
      serverId,
    });
  }

  readFile(serverId: string, path: string): Promise<string> {
    return this.request(`/api/servers/${serverId}/files/contents?path=${encodeURIComponent(path)}`, {
      serverId,
    });
  }

  writeFile(serverId: string, path: string, contents: string): Promise<void> {
    return this.request(`/api/servers/${serverId}/files/write`, {
      method: "POST",
      body: JSON.stringify({ path, contents }),
      serverId,
    });
  }

  deleteFiles(serverId: string, paths: string[]): Promise<void> {
    return this.request(`/api/servers/${serverId}/files/delete`, {
      method: "POST",
      body: JSON.stringify({ paths }),
      serverId,
    });
  }

  renameFile(serverId: string, from: string, to: string): Promise<void> {
    return this.request(`/api/servers/${serverId}/files/rename`, {
      method: "PUT",
      body: JSON.stringify({ from, to }),
      serverId,
    });
  }

  createDirectory(serverId: string, path: string): Promise<void> {
    return this.request(`/api/servers/${serverId}/files/create-directory`, {
      method: "POST",
      body: JSON.stringify({ path }),
      serverId,
    });
  }

  compressFiles(serverId: string, paths: string[], archiveName: string): Promise<FileEntry> {
    return this.request(`/api/servers/${serverId}/files/compress`, {
      method: "POST",
      body: JSON.stringify({ paths, archiveName }),
      serverId,
    });
  }

  decompressFile(serverId: string, path: string): Promise<void> {
    return this.request(`/api/servers/${serverId}/files/decompress`, {
      method: "POST",
      body: JSON.stringify({ path }),
      serverId,
    });
  }

  createBackup(serverId: string, name: string, ignore?: string): Promise<BackupDescriptor> {
    return this.request(`/api/servers/${serverId}/backup`, {
      method: "POST",
      body: JSON.stringify({ name, ignore: ignore ?? "" }),
      serverId,
    });
  }

  restoreBackup(serverId: string, backupId: string): Promise<void> {
    return this.request(`/api/servers/${serverId}/backup/${backupId}/restore`, {
      method: "POST",
      serverId,
    });
  }

  deleteBackup(serverId: string, backupId: string): Promise<void> {
    return this.request(`/api/servers/${serverId}/backup/${backupId}`, {
      method: "DELETE",
      serverId,
    });
  }

  install(serverId: string): Promise<void> {
    return this.request(`/api/servers/${serverId}/install`, { method: "POST", serverId });
  }

  reinstall(serverId: string): Promise<void> {
    return this.request(`/api/servers/${serverId}/reinstall`, { method: "POST", serverId });
  }

  deleteServer(serverId: string): Promise<void> {
    return this.request(`/api/servers/${serverId}`, { method: "DELETE", serverId });
  }
}
