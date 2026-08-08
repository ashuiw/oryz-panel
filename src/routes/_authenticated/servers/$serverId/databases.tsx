import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Database, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useServerRecord } from "@/hooks/use-server";
import { recordAudit } from "@/lib/audit";
import { queryKeys } from "@/lib/query-keys";

export const Route = createFileRoute("/_authenticated/servers/$serverId/databases")({
  component: DatabasesPage,
});

function DatabasesPage() {
  const { serverId } = Route.useParams();
  const server = useServerRecord(serverId);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [remote, setRemote] = useState("%");

  const databases = useQuery({
    enabled: Boolean(server.data?.id),
    queryKey: queryKeys.servers.databases(serverId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("server_databases")
        .select("id, name, engine, host, port, username, remote_access, max_connections, created_at")
        .eq("server_id", server.data!.id)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const record = server.data!;
      const dbName = `s${record.identifier.replace(/[^a-z0-9]/gi, "").slice(0, 10)}_${name
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "")
        .slice(0, 16)}`;
      const { error } = await supabase.from("server_databases").insert({
        server_id: record.id,
        name: dbName,
        engine: "mariadb",
        host: "127.0.0.1",
        port: 3306,
        username: dbName.slice(0, 32),
        remote_access: remote || "%",
        max_connections: 0,
      });
      if (error) throw error;
      await recordAudit({ action: "server.database.create", resourceType: "server", resourceId: record.id });
    },
    onSuccess: () => {
      setOpen(false);
      setName("");
      toast.success("Database created on the node");
      void queryClient.invalidateQueries({ queryKey: queryKeys.servers.databases(serverId) });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("server_databases").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Database removed");
      void queryClient.invalidateQueries({ queryKey: queryKeys.servers.databases(serverId) });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const limit = server.data?.database_limit ?? 0;
  const used = databases.data?.length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {used} of {limit} databases used.
        </p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" disabled={used >= limit}>
              New database
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create a database</DialogTitle>
              <DialogDescription>
                The database is provisioned on the node hosting this server, so it stays available when the panel
                is offline.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="db-name">Name</Label>
                <Input
                  id="db-name"
                  value={name}
                  maxLength={16}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="main"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="db-remote">Allowed connections from</Label>
                <Input
                  id="db-remote"
                  value={remote}
                  maxLength={40}
                  onChange={(event) => setRemote(event.target.value)}
                  placeholder="%"
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => create.mutate()} disabled={!name.trim() || create.isPending}>
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {databases.isLoading && <Skeleton className="h-40 w-full" />}

      {!databases.isLoading && used === 0 && (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            No databases yet.
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {databases.data?.map((db) => (
          <Card key={db.id}>
            <CardContent className="flex flex-wrap items-center gap-4 p-4">
              <Database className="size-4 text-muted-foreground" />
              <div className="min-w-48 flex-1">
                <p className="font-mono text-sm">{db.name}</p>
                <p className="text-xs text-muted-foreground">
                  {db.engine} · {db.host}:{db.port} · user {db.username}
                </p>
              </div>
              <span className="text-xs text-muted-foreground">remote: {db.remote_access}</span>
              <Button size="icon" variant="ghost" className="size-8" onClick={() => remove.mutate(db.id)}>
                <Trash2 className="size-3.5" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
