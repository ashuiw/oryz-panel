import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Activity, Cpu, HardDrive, Server as ServerIcon } from "lucide-react";

import { PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccess } from "@/hooks/use-access";
import { supabase } from "@/integrations/supabase/client";
import { formatMegabytes, formatRelative } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Overview — Oryz Panel" },
      { name: "description", content: "Fleet health, server status and recent activity at a glance." },
    ],
  }),
  component: DashboardPage,
});

const STATUS_TONE: Record<string, string> = {
  running: "bg-success/15 text-success border-success/30",
  offline: "bg-muted text-muted-foreground border-border",
  starting: "bg-info/15 text-info border-info/30",
  stopping: "bg-warning/15 text-warning border-warning/30",
  installing: "bg-info/15 text-info border-info/30",
  error: "bg-destructive/15 text-destructive border-destructive/30",
};

function DashboardPage() {
  const { profile, user } = useAccess();

  const overview = useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: async () => {
      const [servers, activity] = await Promise.all([
        supabase
          .from("servers")
          .select("id, identifier, name, status, memory_mb, disk_mb, cpu_percent, suspended, updated_at")
          .order("updated_at", { ascending: false })
          .limit(6),
        supabase
          .from("audit_logs")
          .select("id, action, actor_label, resource_type, created_at")
          .order("created_at", { ascending: false })
          .limit(6),
      ]);
      if (servers.error) throw servers.error;
      return { servers: servers.data ?? [], activity: activity.data ?? [] };
    },
  });

  const servers = overview.data?.servers ?? [];
  const running = servers.filter((server) => server.status === "running").length;
  const memory = servers.reduce((total, server) => total + server.memory_mb, 0);
  const disk = servers.reduce((total, server) => total + server.disk_mb, 0);

  const greeting = profile?.display_name ?? profile?.username ?? user?.email?.split("@")[0] ?? "there";

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={`Welcome back, ${greeting}`}
        description="Everything you run on Oryz, in one place."
        actions={
          <Button asChild size="sm">
            <Link to="/servers">View all servers</Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Servers" value={String(servers.length)} icon={ServerIcon} loading={overview.isLoading} />
        <StatCard label="Running" value={String(running)} icon={Activity} loading={overview.isLoading} />
        <StatCard label="Memory allocated" value={formatMegabytes(memory)} icon={Cpu} loading={overview.isLoading} />
        <StatCard label="Disk allocated" value={formatMegabytes(disk)} icon={HardDrive} loading={overview.isLoading} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your servers</CardTitle>
            <CardDescription>Most recently updated first.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {overview.isLoading && <Skeleton className="h-24 w-full" />}
            {!overview.isLoading && servers.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No servers yet. Once a node is connected, deployed servers appear here.
              </p>
            )}
            {servers.map((server) => (
              <Link
                key={server.id}
                to="/servers/$serverId"
                params={{ serverId: server.identifier }}
                className="focus-ring flex items-center gap-3 rounded-lg px-2.5 py-2.5 transition-colors hover:bg-muted/60"
              >
                <span className={`status-dot ${server.status === "running" ? "bg-success" : "bg-muted-foreground/40"}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{server.name}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">{server.identifier}</p>
                </div>
                <span className="tnum hidden text-xs text-muted-foreground sm:inline">
                  {formatMegabytes(server.memory_mb)}
                </span>
                <Badge variant="outline" className={STATUS_TONE[server.status] ?? STATUS_TONE["offline"]}>
                  {server.suspended ? "suspended" : server.status}
                </Badge>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent activity</CardTitle>
            <CardDescription>Audit events you can see.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {overview.isLoading && <Skeleton className="h-24 w-full" />}
            {!overview.isLoading && (overview.data?.activity.length ?? 0) === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">Nothing logged yet.</p>
            )}
            {overview.data?.activity.map((entry) => (
              <div key={entry.id} className="space-y-0.5 border-l-2 border-border pl-3">
                <p className="text-sm">{entry.action.replace(/[._]/g, " ")}</p>
                <p className="text-xs text-muted-foreground">{entry.actor_label ? `${entry.actor_label} · ` : ""}
                  {formatRelative(entry.created_at)}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  loading,
}: {
  label: string;
  value: string;
  icon: typeof ServerIcon;
  loading: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="grid size-9 place-items-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          {loading ? <Skeleton className="mt-1 h-5 w-16" /> : <p className="tnum text-lg font-semibold">{value}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
