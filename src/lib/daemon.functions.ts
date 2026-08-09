import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { forwardDaemonRequest } from "@/lib/daemon.server";

export const daemonRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        serverId: z.string().min(1).max(100).optional(),
        nodeId: z.string().uuid().optional(),
        path: z.string().startsWith("/api/").max(1000),
        method: z.enum(["GET", "POST", "PUT", "DELETE"]),
        body: z.unknown().optional(),
      })
      .refine((value) => value.serverId || value.nodeId, "A server or node is required")
      .parse(input),
  )
  .handler(({ data, context }) =>
    forwardDaemonRequest(context.supabase, context.userId, data),
  );