import {
  type BackupDescriptor,
  type ConsoleMessage,
  type ConsoleSubscription,
  type DaemonClient,
  type FileEntry,
  type NodeHealth,
  type PowerAction,
  type ResourceUsage,
} from "./types";
import { daemonRequest } from "@/lib/daemon.functions";

export class ServerDaemonClient implements DaemonClient {
  readonly kind = "http" as const;

  private call<T>(serverId: string, path: string, method: "GET" | "POST" | "PUT" | "DELETE" = "GET", body?: unknown) {
    return daemonRequest({ data: { serverId, path, method, body } }) as Promise<T>;
  }

  sendPower(serverId: string, action: PowerAction) {
    return this.call<void>(serverId, `/api/servers/${serverId}/power`, "POST", { action });
  }
  sendCommand(serverId: string, command: string) {
    return this.call<void>(serverId, `/api/servers/${serverId}/command`, "POST", { command });
  }
  async subscribeConsole(serverId: string, handler: (message: ConsoleMessage) => void): Promise<ConsoleSubscription> {
    let closed = false;
    let cursor = 0;
    const poll = async () => {
      if (closed) return;
      try {
        const result = await this.call<{ cursor: number; messages: ConsoleMessage[] }>(
          serverId,
          `/api/servers/${serverId}/console?cursor=${cursor}`,
        );
        cursor = result.cursor;
        result.messages.forEach(handler);
      } catch {
        handler({ type: "error", code: "node_unreachable", timestamp: new Date().toISOString() });
      }
      if (!closed) setTimeout(poll, 1500);
    };
    void poll();
    return {
      send: (command) => void this.sendCommand(serverId, command),
      close: () => { closed = true; },
    };
  }
  getResourceUsage(serverId: string) {
    return this.call<ResourceUsage>(serverId, `/api/servers/${serverId}/resources`);
  }
  getNodeHealth(nodeId: string) {
    return daemonRequest({ data: { nodeId, path: "/api/system/health", method: "GET" } }) as unknown as Promise<NodeHealth>;
  }
  listFiles(serverId: string, path: string) {
    return this.call<FileEntry[]>(serverId, `/api/servers/${serverId}/files/list?path=${encodeURIComponent(path)}`);
  }
  readFile(serverId: string, path: string) {
    return this.call<string>(serverId, `/api/servers/${serverId}/files/contents?path=${encodeURIComponent(path)}`);
  }
  writeFile(serverId: string, path: string, contents: string) {
    return this.call<void>(serverId, `/api/servers/${serverId}/files/write`, "POST", { path, contents });
  }
  deleteFiles(serverId: string, paths: string[]) {
    return this.call<void>(serverId, `/api/servers/${serverId}/files/delete`, "POST", { paths });
  }
  renameFile(serverId: string, from: string, to: string) {
    return this.call<void>(serverId, `/api/servers/${serverId}/files/rename`, "PUT", { from, to });
  }
  createDirectory(serverId: string, path: string) {
    return this.call<void>(serverId, `/api/servers/${serverId}/files/create-directory`, "POST", { path });
  }
  compressFiles(serverId: string, paths: string[], archiveName: string) {
    return this.call<FileEntry>(serverId, `/api/servers/${serverId}/files/compress`, "POST", { paths, archiveName });
  }
  decompressFile(serverId: string, path: string) {
    return this.call<void>(serverId, `/api/servers/${serverId}/files/decompress`, "POST", { path });
  }
  createBackup(serverId: string, name: string, ignore?: string) {
    return this.call<BackupDescriptor>(serverId, `/api/servers/${serverId}/backup`, "POST", { name, ignore: ignore ?? "" });
  }
  restoreBackup(serverId: string, backupId: string) {
    return this.call<void>(serverId, `/api/servers/${serverId}/backup/${backupId}/restore`, "POST");
  }
  deleteBackup(serverId: string, backupId: string) {
    return this.call<void>(serverId, `/api/servers/${serverId}/backup/${backupId}`, "DELETE");
  }
  install(serverId: string) {
    return this.call<void>(serverId, `/api/servers/${serverId}/install`, "POST");
  }
  reinstall(serverId: string) {
    return this.call<void>(serverId, `/api/servers/${serverId}/reinstall`, "POST");
  }
  deleteServer(serverId: string) {
    return this.call<void>(serverId, `/api/servers/${serverId}`, "DELETE");
  }
}