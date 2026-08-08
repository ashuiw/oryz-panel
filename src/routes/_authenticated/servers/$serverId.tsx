import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { Play, Power, RotateCw, Square } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getDaemonClient, type PowerAction } from "@/daemon";
import { useServerRecord } from "@/hooks/use-server";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/servers/$serverId")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.serverId} — Oryz Panel` },
      {
        name: "description",
        content: "Console, files, databases, backups, networking and settings for this game server.",
      },
      { property: "og:title", content: `${params.serverId} — Oryz Panel` },
      { property: "og:description", content: "Manage this game server from Oryz Panel." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ServerLayout,
});

const TABS: { to: string; label: string; exact?: boolean }[] = [
  { to: "/servers/$serverId", label: "Console", exact: true },
  { to: "/servers/$serverId/files", label: "Files" },
  { to: "/servers/$serverId/databases", label: "Databases" },
  { to: "/servers/$serverId/backups", label: "Backups" },
  { to: "/servers/$serverId/network", label: "Network" },
  { to: "/servers/$serverId/schedules", label: "Schedules" },
  { to: "/servers/$serverId/settings", label: "Settings" },
];

function ServerLayout() {
  const { serverId } = Route.useParams();
  const location = useLocation();
  const query = useServerRecord(serverId);
  const daemon = getDaemonClient();

  async function power(action: PowerAction) {
    try {
      await daemon.sendPower(serverId, action);
      toast.success(`${action} sent to the node`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Power action failed");
    }
  }

  if (query.isLoading) return <Skeleton className="h-96 w-full" />;

  const server = query.data;
  const base = `/servers/${serverId}`;

  if (!server) {
    return (
      <div className="mx-auto max-w-3xl py-24 text-center">
        <h1 className="text-lg font-medium">Server not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          No server with the identifier <span className="font-mono">{serverId}</span> is visible to your account.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={server.name}
        description={server.description ?? `Identifier ${server.identifier}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="capitalize">
              {server.suspended ? "suspended" : server.status}
            </Badge>
            <Button size="sm" variant="outline" onClick={() => void power("start")}>
              <Play className="size-3.5" /> Start
            </Button>
            <Button size="sm" variant="outline" onClick={() => void power("restart")}>
              <RotateCw className="size-3.5" /> Restart
            </Button>
            <Button size="sm" variant="outline" onClick={() => void power("stop")}>
              <Square className="size-3.5" /> Stop
            </Button>
            <Button size="sm" variant="destructive" onClick={() => void power("kill")}>
              <Power className="size-3.5" /> Kill
            </Button>
          </div>
        }
      />

      <nav className="mb-6 flex flex-wrap gap-1 border-b border-border">
        {TABS.map((tab) => {
          const href = tab.to.replace("$serverId", serverId);
          const active = tab.exact ? location.pathname === base : location.pathname.startsWith(href);
          return (
            <Link
              key={tab.label}
              to={tab.to as never}
              params={{ serverId } as never}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <Outlet />
    </div>
  );
}
