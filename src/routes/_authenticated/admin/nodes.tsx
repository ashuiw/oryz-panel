import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { formatMegabytes, formatRelative } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";

export const Route = createFileRoute("/_authenticated/admin/nodes")({
  head: () => ({
    meta: [
      { title: "Nodes — Oryz Panel" },
      { name: "description", content: "Daemon hosts, capacity and heartbeat status." },
    ],
  }),
  component: NodesPage,
});

function NodesPage() {
  const query = useQuery({
    queryKey: queryKeys.nodes.list(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("nodes")
        .select("id, name, fqdn, status, maintenance_mode, memory_mb, disk_mb, cpu_cores, last_heartbeat_at")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Nodes" description="Machines running the Oryz daemon." />

      {query.isLoading && <Skeleton className="h-40 w-full" />}

      {!query.isLoading && (query.data?.length ?? 0) === 0 && (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            No nodes registered. Add a node to start deploying servers.
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {query.data?.map((node) => (
          <Card key={node.id}>
            <CardContent className="flex flex-wrap items-center gap-4 p-4">
              <div className="min-w-48 flex-1">
                <p className="text-sm font-medium">{node.name}</p>
                <p className="truncate font-mono text-xs text-muted-foreground">{node.fqdn}</p>
              </div>
              <div className="tnum text-xs text-muted-foreground">
                {node.cpu_cores} vCPU · {formatMegabytes(node.memory_mb)} RAM · {formatMegabytes(node.disk_mb)} disk
              </div>
              <div className="text-xs text-muted-foreground">
                heartbeat {formatRelative(node.last_heartbeat_at)}
              </div>
              <Badge variant="outline" className="capitalize">
                {node.maintenance_mode ? "maintenance" : node.status}
              </Badge>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
