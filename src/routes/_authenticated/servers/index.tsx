import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Search } from "lucide-react";

import { PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { formatMegabytes } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";

export const Route = createFileRoute("/_authenticated/servers/")({
  head: () => ({
    meta: [
      { title: "Servers — Oryz Panel" },
      { name: "description", content: "Every game server you own or have been granted access to." },
    ],
  }),
  component: ServersPage,
});

function ServersPage() {
  const [term, setTerm] = useState("");

  const query = useQuery({
    queryKey: queryKeys.servers.list(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("servers")
        .select("id, identifier, name, description, status, suspended, memory_mb, disk_mb, cpu_percent")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const servers = (query.data ?? []).filter((server) =>
    `${server.name} ${server.identifier}`.toLowerCase().includes(term.trim().toLowerCase()),
  );

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Servers" description="Deployments you can manage." />

      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={term}
          maxLength={80}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Filter by name or identifier"
          className="pl-8"
        />
      </div>

      {query.isLoading && <Skeleton className="h-40 w-full" />}

      {!query.isLoading && servers.length === 0 && (
        <div className="panel rounded-xl px-6 py-16 text-center">
          <p className="text-sm font-medium">No servers found</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Servers appear here once an administrator deploys one to a connected node.
          </p>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {servers.map((server) => (
          <Link
            key={server.id}
            to="/servers/$serverId"
            params={{ serverId: server.identifier }}
            className="focus-ring panel group rounded-xl p-4 transition-colors hover:border-ring/40"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{server.name}</p>
                <p className="truncate font-mono text-xs text-muted-foreground">{server.identifier}</p>
              </div>
              <Badge variant="outline" className="shrink-0 capitalize">
                {server.suspended ? "suspended" : server.status}
              </Badge>
            </div>
            {server.description && (
              <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{server.description}</p>
            )}
            <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3 text-xs">
              <div>
                <dt className="text-muted-foreground">CPU</dt>
                <dd className="tnum">{server.cpu_percent}%</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Memory</dt>
                <dd className="tnum">{formatMegabytes(server.memory_mb)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Disk</dt>
                <dd className="tnum">{formatMegabytes(server.disk_mb)}</dd>
              </div>
            </dl>
          </Link>
        ))}
      </div>
    </div>
  );
}
