import { ServerDaemonClient } from "./server-adapter";
import type { DaemonClient } from "./types";

export * from "./types";
export { HttpDaemonClient } from "./http-adapter";

let client: DaemonClient | null = null;

/**
 * Single entry point for every server operation in the panel.
 *
 * Browser calls are relayed through an authenticated server function. That
 * relay resolves the server's node and adds its secret credential server-side,
 * so node tokens are never exposed to users.
 */
export function getDaemonClient(): DaemonClient {
  if (!client) client = new ServerDaemonClient();
  return client;
}

/** Test/preview hook for injecting an alternative adapter. */
export function setDaemonClient(next: DaemonClient) {
  client = next;
}
