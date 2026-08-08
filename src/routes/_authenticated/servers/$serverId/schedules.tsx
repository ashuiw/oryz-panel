import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CalendarClock, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useServerRecord } from "@/hooks/use-server";
import { supabase } from "@/integrations/supabase/client";
import { formatRelative } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";

export const Route = createFileRoute("/_authenticated/servers/$serverId/schedules")({
  component: SchedulesPage,
});

function SchedulesPage() {
  const { serverId } = Route.useParams();
  const server = useServerRecord(serverId);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [cron, setCron] = useState("0 4 * * *");
  const [onlyOnline, setOnlyOnline] = useState(true);

  const schedules = useQuery({
    enabled: Boolean(server.data?.id),
    queryKey: queryKeys.servers.schedules(serverId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("schedules")
        .select("id, name, cron_expression, is_active, only_when_online, last_run_at, next_run_at")
        .eq("server_id", server.data!.id)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("schedules").insert({
        server_id: server.data!.id,
        name: name.trim(),
        cron_expression: cron.trim(),
        only_when_online: onlyOnline,
        is_active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setOpen(false);
      setName("");
      toast.success("Schedule created");
      void queryClient.invalidateQueries({ queryKey: queryKeys.servers.schedules(serverId) });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("schedules").update({ is_active: active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.servers.schedules(serverId) }),
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("schedules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.servers.schedules(serverId) }),
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Schedules run on the node, so they keep firing while the panel is offline.
        </p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">New schedule</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create a schedule</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="sc-name">Name</Label>
                <Input id="sc-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="sc-cron">Cron expression</Label>
                <Input
                  id="sc-cron"
                  value={cron}
                  maxLength={60}
                  onChange={(e) => setCron(e.target.value)}
                  className="font-mono"
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="sc-online">Only run when the server is online</Label>
                <Switch id="sc-online" checked={onlyOnline} onCheckedChange={setOnlyOnline} />
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

      {schedules.isLoading && <Skeleton className="h-40 w-full" />}

      {!schedules.isLoading && (schedules.data?.length ?? 0) === 0 && (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            No schedules configured.
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {schedules.data?.map((schedule) => (
          <Card key={schedule.id}>
            <CardContent className="flex flex-wrap items-center gap-4 p-4">
              <CalendarClock className="size-4 text-muted-foreground" />
              <div className="min-w-48 flex-1">
                <p className="text-sm font-medium">{schedule.name}</p>
                <p className="font-mono text-xs text-muted-foreground">{schedule.cron_expression}</p>
              </div>
              <Badge variant="outline">last run {formatRelative(schedule.last_run_at)}</Badge>
              <Switch
                checked={schedule.is_active}
                onCheckedChange={(value) => toggle.mutate({ id: schedule.id, active: value })}
              />
              <Button size="icon" variant="ghost" className="size-8" onClick={() => remove.mutate(schedule.id)}>
                <Trash2 className="size-3.5" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
