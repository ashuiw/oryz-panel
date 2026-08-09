import { supabase } from "@/integrations/supabase/client";

/**
 * Audit logging framework.
 *
 * Every mutating action in the panel calls `recordAudit`. Writes are
 * best-effort: an audit failure must never break the user's action, but it is
 * surfaced in the console so it can be traced.
 *
 * The database enforces `actor_id = auth.uid()` and makes the table
 * append-only (no update/delete grants), so entries cannot be rewritten.
 */

export type AuditAction =
  | `auth.${string}`
  | `profile.${string}`
  | `server.${string}`
  | `node.${string}`
  | `location.${string}`
  | `nest.${string}`
  | `egg.${string}`
  | `allocation.${string}`
  | `user.${string}`
  | `role.${string}`
  | `backup.${string}`
  | `schedule.${string}`
  | `apikey.${string}`
  | `settings.${string}`
  | `webhook.${string}`;


export interface AuditEntry {
  action: AuditAction;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}

export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user) return;

    const { error } = await supabase.from("audit_logs").insert({
      actor_id: user.id,
      actor_label: (user.user_metadata?.["display_name"] as string | undefined) ?? user.email ?? null,
      action: entry.action,
      resource_type: entry.resourceType ?? null,
      resource_id: entry.resourceId ?? null,
      metadata: (entry.metadata ?? {}) as never,
      user_agent: typeof navigator === "undefined" ? null : navigator.userAgent,
    });
    if (error) console.warn("[audit] failed to record entry", entry.action, error.message);
  } catch (error) {
    console.warn("[audit] unexpected failure", error);
  }
}
