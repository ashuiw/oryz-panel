import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Trash2, Webhook } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { recordAudit } from "@/lib/audit";
import { formatRelative } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";

export const Route = createFileRoute("/_authenticated/admin/webhooks")({
  head: () => ({
    meta: [
      { title: "Webhooks — Oryz Panel" },
      {
        name: "description",
        content: "Forward Oryz Panel events such as server power actions and backups to your own services.",
      },
      { property: "og:title", content: "Webhooks — Oryz Panel" },
      { property: "og:description", content: "Outbound event delivery for Oryz Panel." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WebhooksPage,
});

const EVENTS = [
  "server.created",
  "server.deleted",
  "server.power",
  "server.installed",
  "backup.completed",
  "node.offline",
  "user.created",
] as const;

function WebhooksPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>(["server.power"]);

  const webhooks = useQuery({
    queryKey: queryKeys.webhooks,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("webhooks")
        .select("id, name, url, events, is_active, last_delivery_at, last_status, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data: session } = await supabase.auth.getUser();
      const { error } = await supabase.from("webhooks").insert({
        name: name.trim(),
        url: url.trim(),
        events,
        is_active: true,
        created_by: session.user?.id ?? null,
      });
      if (error) throw error;
      await recordAudit({ action: "webhook.create", resourceType: "webhook", resourceId: name.trim() });
    },
    onSuccess: () => {
      setOpen(false);
      setName("");
      setUrl("");
      setEvents(["server.power"]);
      toast.success("Webhook created");
      void queryClient.invalidateQueries({ queryKey: queryKeys.webhooks });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggle = useMutation({
    mutationFn: async (input: { id: string; active: boolean }) => {
      const { error } = await supabase
        .from("webhooks")
        .update({ is_active: input.active })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.webhooks }),
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("webhooks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Webhook deleted");
      void queryClient.invalidateQueries({ queryKey: queryKeys.webhooks });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const valid = name.trim().length > 1 && /^https?:\/\/.+/.test(url.trim()) && events.length > 0;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Webhooks"
        description="Send panel events to Discord, Slack or your own endpoint."
        actions={
          <Button size="sm" onClick={() => setOpen(true)}>
            Create webhook
          </Button>
        }
      />

      {webhooks.isLoading && <Skeleton className="h-40 w-full" />}

      {!webhooks.isLoading && (webhooks.data?.length ?? 0) === 0 && (
        <Card>
          <CardContent className="py-14 text-center text-sm text-muted-foreground">
            No webhooks configured yet.
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {webhooks.data?.map((hook) => (
          <Card key={hook.id}>
            <CardContent className="flex flex-wrap items-center gap-4 p-4">
              <Webhook className="size-4 text-muted-foreground" />
              <div className="min-w-56 flex-1">
                <p className="text-sm font-medium">{hook.name}</p>
                <p className="truncate font-mono text-xs text-muted-foreground">{hook.url}</p>
              </div>
              <div className="flex flex-wrap gap-1">
                {hook.events.map((event) => (
                  <Badge key={event} variant="outline" className="text-[11px]">
                    {event}
                  </Badge>
                ))}
              </div>
              <span className="text-xs text-muted-foreground">
                {hook.last_delivery_at ? `last ${formatRelative(hook.last_delivery_at)}` : "never delivered"}
              </span>
              <Switch
                checked={hook.is_active}
                onCheckedChange={(value) => toggle.mutate({ id: hook.id, active: value })}
              />
              <Button
                size="icon"
                variant="ghost"
                className="size-8"
                onClick={() => {
                  if (window.confirm(`Delete ${hook.name}?`)) remove.mutate(hook.id);
                }}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a webhook</DialogTitle>
            <DialogDescription>
              Oryz Panel posts a JSON payload to this URL whenever a selected event happens.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="w-name">Name</Label>
              <Input id="w-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="w-url">Endpoint URL</Label>
              <Input
                id="w-url"
                value={url}
                maxLength={400}
                placeholder="https://example.com/hooks/oryz"
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Events</Label>
              <div className="flex flex-wrap gap-2">
                {EVENTS.map((event) => {
                  const active = events.includes(event);
                  return (
                    <Button
                      key={event}
                      type="button"
                      size="sm"
                      variant={active ? "secondary" : "outline"}
                      onClick={() =>
                        setEvents((prev) =>
                          active ? prev.filter((item) => item !== event) : [...prev, event],
                        )
                      }
                    >
                      {event}
                    </Button>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button disabled={!valid || create.isPending} onClick={() => create.mutate()}>
              Create webhook
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
