import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Archive, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { getDaemonClient } from "@/daemon";
import { useServerRecord } from "@/hooks/use-server";
import { supabase } from "@/integrations/supabase/client";
import { recordAudit } from "@/lib/audit";
import { formatBytes, formatRelative } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";

export const Route = createFileRoute("/_authenticated/servers/$serverId/backups")({
  component: BackupsPage,
});

function BackupsPage() {
  const { serverId } = Route.useParams();
  const server = useServerRecord(serverId);
  const daemon = getDaemonClient();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");

  const backups = useQuery({
    enabled: Boolean(server.data?.id),
    queryKey: queryKeys.servers.backups(serverId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("backups")
        .select("id, name, status, bytes, progress, is_locked, created_at, completed_at")
        .eq("server_id", server.data!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const record = server.data!;
      const label = name.trim() || `backup-${new Date().toISOString().slice(0, 16)}`;
      const descriptor = await daemon.createBackup(serverId, label);
      const { error } = await supabase.from("backups").insert({
        id: descriptor.id,
        server_id: record.id,
        name: label,
        status: descriptor.status,
        storage_driver: "wings",
        bytes: descriptor.bytes,
        progress: descriptor.progress,
        checksum: descriptor.checksum,
        completed_at: descriptor.completedAt,
      });
      if (error) throw error;
      await recordAudit({ action: "backup.create", resourceType: "server", resourceId: record.id });
    },
    onSuccess: () => {
      setName("");
      toast.success("Backup started on the node");
      void queryClient.invalidateQueries({ queryKey: queryKeys.servers.backups(serverId) });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const restore = useMutation({
    mutationFn: (id: string) => daemon.restoreBackup(serverId, id),
    onSuccess: () => toast.success("Restore queued — the server will restart when it finishes"),
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await daemon.deleteBackup(serverId, id).catch(() => undefined);
      const { error } = await supabase.from("backups").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Backup deleted");
      void queryClient.invalidateQueries({ queryKey: queryKeys.servers.backups(serverId) });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const limit = server.data?.backup_limit ?? 0;
  const used = backups.data?.length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 text-sm text-muted-foreground">
          {used} of {limit} backups stored on this node.
        </p>
        <Input
          value={name}
          maxLength={60}
          onChange={(event) => setName(event.target.value)}
          placeholder="Backup name (optional)"
          className="h-8 w-56"
        />
        <Button size="sm" disabled={used >= limit || create.isPending} onClick={() => create.mutate()}>
          Create backup
        </Button>
      </div>

      {backups.isLoading && <Skeleton className="h-40 w-full" />}

      {!backups.isLoading && used === 0 && (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            No backups yet. Backups are written to the node's own storage.
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {backups.data?.map((backup) => (
          <Card key={backup.id}>
            <CardContent className="flex flex-wrap items-center gap-4 p-4">
              <Archive className="size-4 text-muted-foreground" />
              <div className="min-w-48 flex-1">
                <p className="text-sm font-medium">{backup.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatBytes(Number(backup.bytes))} · created {formatRelative(backup.created_at)}
                </p>
              </div>
              <Badge variant="outline" className="capitalize">
                {backup.status}
              </Badge>
              <Button
                size="sm"
                variant="outline"
                disabled={backup.status !== "completed"}
                onClick={() => restore.mutate(backup.id)}
              >
                <RotateCcw className="size-3.5" /> Restore
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-8"
                disabled={backup.is_locked}
                onClick={() => remove.mutate(backup.id)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
