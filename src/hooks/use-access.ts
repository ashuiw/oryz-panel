import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/query-keys";
import { highestRole, isStaffRole, type AppRole, type PermissionKey } from "@/lib/permissions";

export interface AccessProfile {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  username: string | null;
  timezone: string;
  two_factor_enabled: boolean;
}

/** Session subscription. The root route owns invalidation; this is read-only. */
export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!active) return;
      setSession(next);
      setLoading(false);
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  return { session, user: session?.user ?? null, loading };
}

/**
 * Roles + permissions + profile for the signed-in user.
 * UI gating only — the database enforces the same rules through RLS.
 */
export function useAccess() {
  const { user, loading } = useSession();

  const query = useQuery({
    queryKey: queryKeys.access(user?.id ?? "anonymous"),
    enabled: Boolean(user?.id),
    staleTime: 60_000,
    queryFn: async () => {
      const [profileResult, rolesResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, email, display_name, avatar_url, username, timezone, two_factor_enabled")
          .eq("id", user!.id)
          .maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", user!.id),
      ]);

      const roles = (rolesResult.data ?? []).map((row) => row.role as AppRole);

      let permissions: string[] = [];
      if (roles.length > 0) {
        const { data } = await supabase
          .from("role_permissions")
          .select("permission_key")
          .in("role", roles);
        permissions = [...new Set((data ?? []).map((row) => row.permission_key))];
      }

      return {
        profile: (profileResult.data ?? null) as AccessProfile | null,
        roles,
        permissions,
      };
    },
  });

  const roles = query.data?.roles ?? [];
  const permissions = query.data?.permissions ?? [];

  return {
    user: user as User | null,
    profile: query.data?.profile ?? null,
    roles,
    permissions,
    role: highestRole(roles),
    isStaff: isStaffRole(roles),
    can: (permission: PermissionKey) => permissions.includes(permission),
    hasRole: (role: AppRole) => roles.includes(role),
    loading: loading || query.isLoading,
    refetch: query.refetch,
  };
}
