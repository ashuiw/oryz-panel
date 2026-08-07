import { createFileRoute, redirect } from "@tanstack/react-router";

import { OryzMark } from "@/components/brand/oryz-mark";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Oryz Panel" },
      {
        name: "description",
        content: "Sign in to the Oryz game server control panel.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Oryz Panel" },
      { property: "og:description", content: "Sign in to the Oryz game server control panel." },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    throw redirect({ to: data.user ? "/dashboard" : "/auth" });
  },
  component: PanelEntry,
});

function PanelEntry() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background">
      <OryzMark className="size-12 animate-pulse" />
      <span className="sr-only">Loading Oryz Panel</span>
    </main>
  );
}
