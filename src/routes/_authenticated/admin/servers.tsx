import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { recordAudit } from "@/lib/audit";
import { formatMegabytes } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";

export const Route = createFileRoute("/_authenticated/admin/servers")({
  head: () => ({
    meta: [
      { title: "Servers — Oryz Panel" },
      { name: "description", content: "Every server on this panel, and provisioning for any user on any node." },
      { property: "og:title", content: "Servers — Oryz Panel" },
      { property: "og:description", content: "Provision and manage game servers across every node." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminServersPage,
});

interface FormState {
  name: string;
  description: string;
  ownerId: string;
  nodeId: string;
  eggId: string;
  image: string;
  startup: string;
  allocationId: string;
  memoryMb: string;
  swapMb: string;
  diskMb: string;
  cpuPercent: string;
  ioWeight: string;
  oomKiller: boolean;
  databaseLimit: string;
  allocationLimit: string;
  backupLimit: string;
  startOnCompletion: boolean;
}

const EMPTY_FORM: FormState = {
  name: "",
  description: "",
  ownerId: "",
  nodeId: "",
  eggId: "",
  image: "",
  startup: "",
  allocationId: "",
  memoryMb: "2048",
  swapMb: "0",
  diskMb: "10240",
  cpuPercent: "100",
  ioWeight: "500",
  oomKiller: false,
  databaseLimit: "2",
  allocationLimit: "2",
  backupLimit: "3",
  startOnCompletion: true,
};

function identifierFor(name: string) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 16);
  return `${slug || "server"}-${Math.random().toString(36).slice(2, 8)}`;
}

function AdminServersPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [variables, setVariables] = useState<Record<string, string>>({});

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const servers = useQuery({
    queryKey: queryKeys.servers.list(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("servers")
        .select("id, identifier, name, status, suspended, memory_mb, disk_mb, owner_id, node_id")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const options = useQuery({
    queryKey: ["admin", "server-form-options"],
    queryFn: async () => {
      const [people, nodes, eggs, eggVars] = await Promise.all([
        supabase.from("profiles").select("id, email, display_name").order("display_name"),
        supabase.from("nodes").select("id, name, fqdn, status, maintenance_mode").order("name"),
        supabase.from("eggs").select("id, name, docker_images, startup").order("name"),
        supabase
          .from("egg_variables")
          .select("id, egg_id, name, description, env_variable, default_value, sort_order")
          .order("sort_order"),
      ]);
      if (people.error) throw people.error;
      if (nodes.error) throw nodes.error;
      if (eggs.error) throw eggs.error;
      return {
        people: people.data,
        nodes: nodes.data,
        eggs: eggs.data,
        eggVars: eggVars.data ?? [],
      };
    },
  });

  const freePorts = useQuery({
    enabled: Boolean(form.nodeId),
    queryKey: ["admin", "free-allocations", form.nodeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("allocations")
        .select("id, ip, ip_alias, port")
        .eq("node_id", form.nodeId)
        .is("server_id", null)
        .order("port")
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  const selectedEgg = options.data?.eggs.find((item) => item.id === form.eggId);
  const eggVariables = (options.data?.eggVars ?? []).filter((item) => item.egg_id === form.eggId);

  useEffect(() => {
    if (!selectedEgg) return;
    const images = (selectedEgg.docker_images ?? {}) as Record<string, string>;
    setForm((prev) => ({
      ...prev,
      image: Object.values(images)[0] ?? "",
      startup: selectedEgg.startup,
    }));
  }, [selectedEgg]);

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const variable of eggVariables) next[variable.env_variable] = variable.default_value ?? "";
    setVariables(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.eggId]);

  const create = useMutation({
    mutationFn: async (values: FormState) => {
      const { data, error } = await supabase
        .from("servers")
        .insert({
          identifier: identifierFor(values.name),
          name: values.name.trim(),
          description: values.description.trim() || null,
          owner_id: values.ownerId,
          node_id: values.nodeId || null,
          egg_id: values.eggId || null,
          docker_image: values.image || null,
          startup_command: values.startup || null,
          memory_mb: Number(values.memoryMb),
          swap_mb: Number(values.swapMb),
          disk_mb: Number(values.diskMb),
          cpu_percent: Number(values.cpuPercent),
          io_weight: Number(values.ioWeight),
          oom_killer: values.oomKiller,
          database_limit: Number(values.databaseLimit),
          allocation_limit: Number(values.allocationLimit),
          backup_limit: Number(values.backupLimit),
          status: "installing" as const,
        })
        .select("id")
        .single();
      if (error) throw error;

      const rows = Object.entries(variables).map(([env_variable, value]) => ({
        server_id: data.id,
        env_variable,
        value,
      }));
      if (rows.length > 0) await supabase.from("server_variables").insert(rows);

      if (values.allocationId) {
        await supabase
          .from("allocations")
          .update({ server_id: data.id, is_primary: true })
          .eq("id", values.allocationId);
      }

      await recordAudit({ action: "server.create", resourceType: "server", resourceId: data.id });
    },
    onSuccess: () => {
      toast.success("Server queued for installation on its node");
      setForm(EMPTY_FORM);
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: queryKeys.servers.all });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("servers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Server deleted");
      void queryClient.invalidateQueries({ queryKey: queryKeys.servers.all });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const ownerLabel = (id: string) => {
    const person = options.data?.people.find((item) => item.id === id);
    return person?.display_name ?? person?.email ?? "unknown owner";
  };
  const nodeLabel = (id: string | null) =>
    options.data?.nodes.find((item) => item.id === id)?.name ?? "unassigned";

  const valid =
    form.name.trim().length > 1 &&
    form.ownerId !== "" &&
    form.nodeId !== "" &&
    form.eggId !== "" &&
    Number(form.memoryMb) > 0 &&
    Number(form.diskMb) > 0;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Servers"
        description="Every server on this panel. Provision one for any user, on any node."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">Create server</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create a server</DialogTitle>
                <DialogDescription>
                  The server is created on the selected node and owned by the selected user. Its data lives on
                  that node only.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4">
                <Field id="srv-name" label="Name">
                  <Input
                    id="srv-name"
                    value={form.name}
                    maxLength={80}
                    onChange={(e) => set("name", e.target.value)}
                    placeholder="Survival SMP"
                  />
                </Field>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field id="srv-owner" label="Owner">
                    <Select value={form.ownerId} onValueChange={(v) => set("ownerId", v)}>
                      <SelectTrigger id="srv-owner">
                        <SelectValue placeholder="Select a user" />
                      </SelectTrigger>
                      <SelectContent>
                        {options.data?.people.map((person) => (
                          <SelectItem key={person.id} value={person.id}>
                            {person.display_name ?? person.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field id="srv-node" label="Node">
                    <Select value={form.nodeId} onValueChange={(v) => set("nodeId", v)}>
                      <SelectTrigger id="srv-node">
                        <SelectValue placeholder="Select a node" />
                      </SelectTrigger>
                      <SelectContent>
                        {options.data?.nodes.map((node) => (
                          <SelectItem key={node.id} value={node.id} disabled={node.maintenance_mode}>
                            {node.name} · {node.fqdn}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field id="srv-egg" label="Egg">
                    <Select value={form.eggId} onValueChange={(v) => set("eggId", v)}>
                      <SelectTrigger id="srv-egg">
                        <SelectValue placeholder="Select a game type" />
                      </SelectTrigger>
                      <SelectContent>
                        {options.data?.eggs.map((egg) => (
                          <SelectItem key={egg.id} value={egg.id}>
                            {egg.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field id="srv-port" label="Primary port">
                    <Select value={form.allocationId} onValueChange={(v) => set("allocationId", v)}>
                      <SelectTrigger id="srv-port">
                        <SelectValue placeholder={form.nodeId ? "Select a port" : "Choose a node first"} />
                      </SelectTrigger>
                      <SelectContent>
                        {freePorts.data?.map((allocation) => (
                          <SelectItem key={allocation.id} value={allocation.id}>
                            {allocation.ip_alias ?? allocation.ip}:{allocation.port}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>

                <Field id="srv-image" label="Container image">
                  <Select value={form.image} onValueChange={(v) => set("image", v)}>
                    <SelectTrigger id="srv-image">
                      <SelectValue placeholder="Select an image" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries((selectedEgg?.docker_images ?? {}) as Record<string, string>).map(
                        ([label, value]) => (
                          <SelectItem key={value} value={value}>
                            {label} — {value}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                </Field>

                <Field id="srv-startup" label="Startup command">
                  <Textarea
                    id="srv-startup"
                    rows={3}
                    value={form.startup}
                    onChange={(e) => set("startup", e.target.value)}
                    className="font-mono text-xs"
                  />
                </Field>

                {eggVariables.length > 0 && (
                  <>
                    <Separator />
                    <p className="text-xs font-medium text-muted-foreground">Template variables</p>
                    {eggVariables.map((variable) => (
                      <Field key={variable.id} id={`v-${variable.id}`} label={variable.name}>
                        <Input
                          id={`v-${variable.id}`}
                          value={variables[variable.env_variable] ?? ""}
                          maxLength={200}
                          onChange={(e) =>
                            setVariables((prev) => ({ ...prev, [variable.env_variable]: e.target.value }))
                          }
                        />
                        <p className="text-xs text-muted-foreground">{variable.description}</p>
                      </Field>
                    ))}
                    <Separator />
                  </>
                )}

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Field id="srv-mem" label="Memory (MB)">
                    <Input
                      id="srv-mem"
                      value={form.memoryMb}
                      onChange={(e) => set("memoryMb", e.target.value.replace(/\D/g, ""))}
                    />
                  </Field>
                  <Field id="srv-swap" label="Swap (MB)">
                    <Input
                      id="srv-swap"
                      value={form.swapMb}
                      onChange={(e) => set("swapMb", e.target.value.replace(/\D/g, ""))}
                    />
                  </Field>
                  <Field id="srv-disk" label="Disk (MB)">
                    <Input
                      id="srv-disk"
                      value={form.diskMb}
                      onChange={(e) => set("diskMb", e.target.value.replace(/\D/g, ""))}
                    />
                  </Field>
                  <Field id="srv-cpu" label="CPU (%)">
                    <Input
                      id="srv-cpu"
                      value={form.cpuPercent}
                      onChange={(e) => set("cpuPercent", e.target.value.replace(/\D/g, ""))}
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Field id="srv-io" label="IO weight">
                    <Input
                      id="srv-io"
                      value={form.ioWeight}
                      onChange={(e) => set("ioWeight", e.target.value.replace(/\D/g, ""))}
                    />
                  </Field>
                  <Field id="srv-db" label="Database limit">
                    <Input
                      id="srv-db"
                      value={form.databaseLimit}
                      onChange={(e) => set("databaseLimit", e.target.value.replace(/\D/g, ""))}
                    />
                  </Field>
                  <Field id="srv-alloc" label="Port limit">
                    <Input
                      id="srv-alloc"
                      value={form.allocationLimit}
                      onChange={(e) => set("allocationLimit", e.target.value.replace(/\D/g, ""))}
                    />
                  </Field>
                  <Field id="srv-backup" label="Backup limit">
                    <Input
                      id="srv-backup"
                      value={form.backupLimit}
                      onChange={(e) => set("backupLimit", e.target.value.replace(/\D/g, ""))}
                    />
                  </Field>
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="srv-oom">Enable the OOM killer</Label>
                  <Switch
                    id="srv-oom"
                    checked={form.oomKiller}
                    onCheckedChange={(value) => set("oomKiller", value)}
                  />
                </div>

                <Field id="srv-desc" label="Description">
                  <Textarea
                    id="srv-desc"
                    rows={2}
                    maxLength={500}
                    value={form.description}
                    onChange={(e) => set("description", e.target.value)}
                  />
                </Field>
              </div>

              <DialogFooter>
                <Button disabled={!valid || create.isPending} onClick={() => create.mutate(form)}>
                  Create server
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {servers.isLoading && <Skeleton className="h-40 w-full" />}

      {!servers.isLoading && (servers.data?.length ?? 0) === 0 && (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            No servers yet. Register a node first, then create a server for any user.
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {servers.data?.map((server) => (
          <Card key={server.id}>
            <CardContent className="flex flex-wrap items-center gap-4 p-4">
              <div className="min-w-48 flex-1">
                <Link
                  to="/servers/$serverId"
                  params={{ serverId: server.identifier }}
                  className="text-sm font-medium hover:underline"
                >
                  {server.name}
                </Link>
                <p className="truncate font-mono text-xs text-muted-foreground">{server.identifier}</p>
              </div>
              <span className="text-xs text-muted-foreground">{ownerLabel(server.owner_id)}</span>
              <span className="text-xs text-muted-foreground">{nodeLabel(server.node_id)}</span>
              <span className="tnum text-xs text-muted-foreground">
                {formatMegabytes(server.memory_mb)} · {formatMegabytes(server.disk_mb)}
              </span>
              <Badge variant="outline" className="capitalize">
                {server.suspended ? "suspended" : server.status}
              </Badge>
              <Button
                size="icon"
                variant="ghost"
                className="size-8"
                onClick={() => {
                  if (window.confirm(`Delete ${server.name}? Its data is removed from the node.`)) {
                    remove.mutate(server.id);
                  }
                }}
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

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
