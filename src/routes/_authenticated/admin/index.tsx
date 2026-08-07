import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Boxes, FileClock, Network, Settings, Users } from "lucide-react";

import { PageHeader } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [
      { title: "Administration — Oryz Panel" },
      { name: "description", content: "Fleet-wide administration for nodes, eggs, users and settings." },
    ],
  }),
  component: AdminHome,
});

const SECTIONS = [
  { to: "/admin/nodes", label: "Nodes", description: "Daemon hosts and capacity", icon: Network },
  { to: "/admin/nests", label: "Nests & eggs", description: "Game templates and variables", icon: Boxes },
  { to: "/admin/users", label: "Users", description: "Accounts and role assignment", icon: Users },
  { to: "/admin/audit", label: "Audit log", description: "Append-only activity record", icon: FileClock },
  { to: "/admin/settings", label: "Settings", description: "Panel-wide configuration", icon: Settings },
];

function AdminHome() {
  const counts = useQuery({
    queryKey: ["admin", "counts"],
    queryFn: async () => {
      const [nodes, servers, users] = await Promise.all([
        supabase.from("nodes").select("id", { count: "exact", head: true }),
        supabase.from("servers").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
      ]);
      return { nodes: nodes.count ?? 0, servers: servers.count ?? 0, users: users.count ?? 0 };
    },
  });

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Administration" description="Everything that runs the platform." />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {[
          { label: "Nodes", value: counts.data?.nodes ?? 0 },
          { label: "Servers", value: counts.data?.servers ?? 0 },
          { label: "Users", value: counts.data?.users ?? 0 },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className="tnum text-2xl font-semibold">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {SECTIONS.map((section) => (
          <Link
            key={section.to}
            to={section.to}
            className="focus-ring panel flex items-center gap-3 rounded-xl p-4 transition-colors hover:border-ring/40"
          >
            <div className="grid size-9 place-items-center rounded-lg bg-muted text-muted-foreground">
              <section.icon className="size-4" />
            </div>
            <div>
              <p className="text-sm font-medium">{section.label}</p>
              <p className="text-xs text-muted-foreground">{section.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
