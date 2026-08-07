import { createMockDaemonClient } from "./mock-adapter";
import type { DaemonClient } from "./types";

export * from "./types";
export { HttpDaemonClient } from "./http-adapter";

let client: DaemonClient | null = null;

/**
 * Single entry point for every server operation in the panel.
 *
 * Swap in the real fleet by replacing the factory below with
 * `new HttpDaemonClient({ baseUrl, getToken })` — no component, hook or
 * database change is required, because both adapters satisfy `DaemonClient`.
 */
export function getDaemonClient(): DaemonClient {
  if (!client) client = createMockDaemonClient();
  return client;
}

/** Test/preview hook for injecting an alternative adapter. */
export function setDaemonClient(next: DaemonClient) {
  client = next;
}
