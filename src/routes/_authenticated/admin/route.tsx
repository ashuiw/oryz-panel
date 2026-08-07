import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: staff } = await supabase.rpc("is_staff", { _user_id: data.user.id });
    if (!staff) throw redirect({ to: "/dashboard" });
  },
  component: () => <Outlet />,
});
