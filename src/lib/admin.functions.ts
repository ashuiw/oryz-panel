/**
 * Privileged administration server functions.
 *
 * Creating accounts and granting roles needs the service role, which never
 * reaches the browser. Every handler re-verifies that the caller is staff
 * through the caller's own (RLS-scoped) client before escalating.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ROLES = [
  "owner",
  "super_admin",
  "admin",
  "moderator",
  "support",
  "user",
  "guest",
] as const;

async function assertStaff(supabase: {
  rpc: (name: "is_staff", args: { _user_id: string }) => Promise<{ data: unknown }>;
}, userId: string) {
  const { data } = await supabase.rpc("is_staff", { _user_id: userId });
  if (data !== true) throw new Error("Forbidden: staff access is required");
}

export const adminListUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: profiles }, { data: roles }] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id, email, display_name, username, suspended, last_login_at, created_at")
        .order("created_at", { ascending: false }),
      supabaseAdmin.from("user_roles").select("user_id, role"),
    ]);

    return {
      profiles: profiles ?? [],
      roles: roles ?? [],
    };
  });

export const adminCreateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        email: z.string().email().max(200),
        password: z.string().min(8).max(200),
        displayName: z.string().trim().min(1).max(80),
        username: z.string().trim().min(2).max(40).regex(/^[a-zA-Z0-9_.-]+$/),
        role: z.enum(ROLES),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const created = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { display_name: data.displayName },
    });
    if (created.error) throw new Error(created.error.message);
    const userId = created.data.user?.id;
    if (!userId) throw new Error("The account was not created");

    await supabaseAdmin
      .from("profiles")
      .update({ display_name: data.displayName, username: data.username, email: data.email })
      .eq("id", userId);

    await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
    const roleInsert = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: data.role, granted_by: context.userId });
    if (roleInsert.error) throw new Error(roleInsert.error.message);

    return { userId };
  });

export const adminSetUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: z.string().uuid(), role: z.enum(ROLES) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.userId === context.userId) {
      throw new Error("You cannot change your own role");
    }

    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.userId, role: data.role, granted_by: context.userId });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase as never, context.userId);
    if (data.userId === context.userId) throw new Error("You cannot delete your own account");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminResetPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: z.string().uuid(), password: z.string().min(8).max(200) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.password,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
