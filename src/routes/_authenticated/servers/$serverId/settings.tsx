import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { getDaemonClient } from "@/daemon";
import { useAccess } from "@/hooks/use-access";
import { useServerRecord } from "@/hooks/use-server";
import { supabase } from "@/integrations/supabase/client";
import { recordAudit } from "@/lib/audit";
import { queryKeys } from "@/lib/query-keys";

export const Route = createFileRoute("/_authenticated/servers/$serverId/settings")({
  component: ServerSettingsPage,
});

function ServerSettingsPage() {
  const { serverId } = Route.useParams();
  const server = useServerRecord(serverId);
  const access = useAccess();
  const daemon = getDaemonClient();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startup, setStartup] = useState("");
  const [image, setImage] = useState("");
  const [variables, setVariables] = useState<Record<string, string>>({});

  const record = server.data;

  const egg = useQuery({
    enabled: Boolean(record?.egg_id),
    queryKey: ["egg", record?.egg_id],
    queryFn: async () => {
      const [eggRow, vars] = await Promise.all([
        supabase
          .from("eggs")
          .select("id, name, docker_images, startup")
          .eq("id", record!.egg_id!)
          .maybeSingle(),
        supabase
          .from("egg_variables")
          .select("id, name, description, env_variable, default_value, user_editable, sort_order")
          .eq("egg_id", record!.egg_id!)
          .order("sort_order"),
      ]);
      if (eggRow.error) throw eggRow.error;
      return { egg: eggRow.data, variables: vars.data ?? [] };
    },
  });

  const serverVars = useQuery({
    enabled: Boolean(record?.id),
    queryKey: ["server-variables", record?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("server_variables")
        .select("id, env_variable, value")
        .eq("server_id", record!.id);
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!record) return;
    setName(record.name);
    setDescription(record.description ?? "");
    setStartup(record.startup_command ?? "");
    setImage(record.docker_image ?? "");
  }, [record]);

  useEffect(() => {
    if (!egg.data || !serverVars.data) return;
    const next: Record<string, string> = {};
    for (const variable of egg.data.variables) {
      const stored = serverVars.data.find((entry) => entry.env_variable === variable.env_variable);
      next[variable.env_variable] = stored?.value ?? variable.default_value ?? "";
    }
    setVariables(next);
  }, [egg.data, serverVars.data]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("servers")
        .update({
          name: name.trim(),
          description: description.trim() || null,
          startup_command: startup.trim() || null,
          docker_image: image || null,
        })
        .eq("id", record!.id);
      if (error) throw error;

      for (const [env, value] of Object.entries(variables)) {
        const existing = serverVars.data?.find((entry) => entry.env_variable === env);
        if (existing) {
          await supabase.from("server_variables").update({ value }).eq("id", existing.id);
        } else {
          await supabase
            .from("server_variables")
            .insert({ server_id: record!.id, env_variable: env, value });
        }
      }
      await recordAudit({ action: "server.update", resourceType: "server", resourceId: record!.id });
    },
    onSuccess: () => {
      toast.success("Settings saved");
      void queryClient.invalidateQueries({ queryKey: queryKeys.servers.detail(serverId) });
      void queryClient.invalidateQueries({ queryKey: ["server-variables", record?.id] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const reinstall = useMutation({
    mutationFn: async () => {
      await daemon.reinstall(serverId);
      const { error } = await supabase
        .from("servers")
        .update({ status: "installing" as const })
        .eq("id", record!.id);
      if (error) throw error;
      await recordAudit({ action: "server.reinstall", resourceType: "server", resourceId: record!.id });
    },
    onSuccess: () => {
      toast.success("Reinstall started — the node is rebuilding this server");
      void queryClient.invalidateQueries({ queryKey: queryKeys.servers.detail(serverId) });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const destroy = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("servers").delete().eq("id", record!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Server deleted");
      window.location.href = "/servers";
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (server.isLoading || !record) return <Skeleton className="h-96 w-full" />;

  const images = (egg.data?.egg?.docker_images ?? {}) as Record<string, string>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">General</CardTitle>
          <CardDescription>Rename the server and adjust how it is described in the panel.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="s-name">Name</Label>
            <Input id="s-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="s-desc">Description</Label>
            <Textarea
              id="s-desc"
              rows={2}
              maxLength={500}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label>Identifier</Label>
            <Input readOnly value={record.identifier} className="font-mono" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Startup</CardTitle>
          <CardDescription>
            Runtime image, startup command and the template variables the node substitutes at boot.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="s-image">Runtime image</Label>
            <Select value={image} onValueChange={setImage}>
              <SelectTrigger id="s-image">
                <SelectValue placeholder="Select a container image" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(images).map(([label, value]) => (
                  <SelectItem key={value} value={value}>
                    {label} — {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="s-startup">Startup command</Label>
            <Textarea
              id="s-startup"
              rows={3}
              value={startup}
              onChange={(e) => setStartup(e.target.value)}
              className="font-mono text-xs"
            />
          </div>

          <Separator />

          {(egg.data?.variables ?? []).map((variable) => (
            <div key={variable.id} className="grid gap-2">
              <Label htmlFor={`var-${variable.id}`}>{variable.name}</Label>
              <Input
                id={`var-${variable.id}`}
                value={variables[variable.env_variable] ?? ""}
                disabled={!variable.user_editable && !access.isStaff}
                maxLength={200}
                onChange={(e) =>
                  setVariables((prev) => ({ ...prev, [variable.env_variable]: e.target.value }))
                }
              />
              <p className="text-xs text-muted-foreground">
                {variable.description} · <span className="font-mono">{variable.env_variable}</span>
              </p>
            </div>
          ))}

          <div>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              Save changes
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-base">Danger zone</CardTitle>
          <CardDescription>
            Reinstalling wipes the server files and runs the egg install script again. Deleting removes the
            server and its data from the node.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => reinstall.mutate()} disabled={reinstall.isPending}>
            Reinstall server
          </Button>
          {access.isStaff && (
            <Button
              variant="destructive"
              onClick={() => {
                if (window.confirm(`Delete ${record.name}? This cannot be undone.`)) destroy.mutate();
              }}
            >
              Delete server
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
