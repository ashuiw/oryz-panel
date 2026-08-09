import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

type UserClient = SupabaseClient<Database>;

type DaemonRequest = {
  serverId?: string | undefined;
  nodeId?: string | undefined;
  path: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown | undefined;
};

export type DaemonResponse =
  | null
  | boolean
  | number
  | string
  | DaemonResponse[]
  | { [key: string]: DaemonResponse };

function safePath(path: string) {
  if (!path.startsWith("/api/") || path.includes("..") || path.includes("\\")) {
    throw new Error("Invalid node API path");
  }
  return path;
}

export async function forwardDaemonRequest(
  client: UserClient,
  userId: string,
  request: DaemonRequest,
): Promise<DaemonResponse> {
  const { data: staff } = await client.rpc("is_staff", { _user_id: userId });
  let nodeId = request.nodeId;

  if (request.serverId) {
    const { data: server, error } = await client
      .from("servers")
      .select("id, node_id")
      .eq("identifier", request.serverId)
      .maybeSingle();
    if (error || !server) throw new Error("Server not found or access denied");
    nodeId = server.node_id ?? undefined;
  } else if (!staff) {
    throw new Error("Staff access is required for node operations");
  }

  if (!nodeId) throw new Error("This server is not assigned to a node");

  // Access has already been verified with the caller's RLS-scoped client.
  // Load the node credential only after that check; it never reaches the browser.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: node, error: nodeError } = await supabaseAdmin
    .from("nodes")
    .select("fqdn, scheme, daemon_port, daemon_token")
    .eq("id", nodeId)
    .maybeSingle();
  if (nodeError || !node) throw new Error("Node not found");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    let body = request.body;
    if (request.serverId && (request.path.endsWith("/install") || request.path.endsWith("/reinstall"))) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: server } = await supabaseAdmin
        .from("servers")
        .select("id, docker_image, startup_command, memory_mb, cpu_percent")
        .eq("identifier", request.serverId)
        .single();
      if (!server) throw new Error("Server installation manifest is missing");
      const [{ data: variables }, { data: allocations }] = await Promise.all([
        supabaseAdmin.from("server_variables").select("env_variable, value").eq("server_id", server.id),
        supabaseAdmin.from("allocations").select("ip, port").eq("server_id", server.id),
      ]);
      body = {
        dockerImage: server.docker_image,
        startupCommand: server.startup_command,
        memoryMb: server.memory_mb,
        cpuPercent: server.cpu_percent,
        variables: Object.fromEntries((variables ?? []).map((item) => [item.env_variable, item.value ?? ""])),
        allocations: allocations ?? [],
      };
    }

    const response = await fetch(
      `${node.scheme}://${node.fqdn}:${node.daemon_port}${safePath(request.path)}`,
      {
        method: request.method,
        headers: {
          authorization: `Bearer ${node.daemon_token}`,
          "content-type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
      },
    );
    const text = await response.text();
    let payload: DaemonResponse = null;
    if (text) {
      try {
        payload = JSON.parse(text) as DaemonResponse;
      } catch {
        payload = text;
      }
    }
    if (!response.ok) {
      const message =
        payload && typeof payload === "object" && "message" in payload
          ? String(payload["message"])
          : `Node request failed (${response.status})`;
      throw new Error(message);
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}