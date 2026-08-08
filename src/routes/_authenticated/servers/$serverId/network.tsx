import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Network, Star } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useServerRecord } from "@/hooks/use-server";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/query-keys";

export const Route = createFileRoute("/_authenticated/servers/$serverId/network")({
  component: NetworkPage,
});

function NetworkPage() {
  const { serverId } = Route.useParams();
  const server = useServerRecord(serverId);
  const queryClient = useQueryClient();

  const allocations = useQuery({
    enabled: Boolean(server.data?.id),
    queryKey: queryKeys.servers.allocations(serverId),
    queryFn: async () => {
      const record = server.data!;
      const [assigned, free] = await Promise.all([
        supabase
          .from("allocations")
          .select("id, ip, ip_alias, port, is_primary, notes")
          .eq("server_id", record.id)
          .order("port"),
        record.node_id
          ? supabase
              .from("allocations")
              .select("id, ip, ip_alias, port")
              .eq("node_id", record.node_id)
              .is("server_id", null)
              .order("port")
              .limit(50)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (assigned.error) throw assigned.error;
      return { assigned: assigned.data, free: free.data ?? [] };
    },
  });

  const attach = useMutation({
    mutationFn: async (allocationId: string) => {
      const { error } = await supabase
        .from("allocations")
        .update({ server_id: server.data!.id })
        .eq("id", allocationId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Port assigned to this server");
      void queryClient.invalidateQueries({ queryKey: queryKeys.servers.allocations(serverId) });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const detach = useMutation({
    mutationFn: async (allocationId: string) => {
      const { error } = await supabase
        .from("allocations")
        .update({ server_id: null, is_primary: false })
        .eq("id", allocationId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Port released");
      void queryClient.invalidateQueries({ queryKey: queryKeys.servers.allocations(serverId) });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const makePrimary = useMutation({
    mutationFn: async (allocationId: string) => {
      const record = server.data!;
      await supabase.from("allocations").update({ is_primary: false }).eq("server_id", record.id);
      const { error } = await supabase
        .from("allocations")
        .update({ is_primary: true })
        .eq("id", allocationId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Primary port updated");
      void queryClient.invalidateQueries({ queryKey: queryKeys.servers.allocations(serverId) });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (allocations.isLoading) return <Skeleton className="h-64 w-full" />;

  const limit = server.data?.allocation_limit ?? 0;
  const assigned = allocations.data?.assigned ?? [];

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="text-sm font-medium">
          Assigned ports <span className="text-muted-foreground">({assigned.length} of {limit})</span>
        </h2>
        {assigned.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              No ports assigned yet — attach one from the node's free pool below.
            </CardContent>
          </Card>
        )}
        {assigned.map((allocation) => (
          <Card key={allocation.id}>
            <CardContent className="flex flex-wrap items-center gap-4 p-4">
              <Network className="size-4 text-muted-foreground" />
              <p className="min-w-48 flex-1 font-mono text-sm">
                {allocation.ip_alias ?? allocation.ip}:{allocation.port}
              </p>
              {allocation.is_primary ? (
                <Badge variant="secondary">Primary</Badge>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => makePrimary.mutate(allocation.id)}>
                  <Star className="size-3.5" /> Make primary
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => detach.mutate(allocation.id)}>
                Release
              </Button>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Available on this node</h2>
        {(allocations.data?.free.length ?? 0) === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              No free ports on this node. An administrator can add more from the node's settings.
            </CardContent>
          </Card>
        )}
        <div className="flex flex-wrap gap-2">
          {allocations.data?.free.map((allocation) => (
            <Button
              key={allocation.id}
              size="sm"
              variant="outline"
              disabled={assigned.length >= limit}
              onClick={() => attach.mutate(allocation.id)}
              className="font-mono"
            >
              {allocation.ip_alias ?? allocation.ip}:{allocation.port}
            </Button>
          ))}
        </div>
      </section>
    </div>
  );
}
