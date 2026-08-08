import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Copy, Server as ServerIcon, Trash2 } from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { buildNodeConfig, nodeBootstrapCommand } from "@/lib/node-config";
import { formatMegabytes, formatRelative } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";

export const Route = createFileRoute("/_authenticated/admin/nodes")({
  head: () => ({
    meta: [
      { title: "Nodes — Oryz Panel" },
      { name: "description", content: "Register daemon hosts, review capacity and copy node configuration." },
      { property: "og:title", content: "Nodes — Oryz Panel" },
      { property: "og:description", content: "Register and monitor Oryz Panel nodes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NodesPage,
});

interface NodeForm {
  name: string;
  description: string;
  fqdn: string;
  scheme: string;
  daemonPort: string;
  sftpPort: string;
  memoryMb: string;
  diskMb: string;
  cpuCores: string;
  locationId: string;
  publicNode: boolean;
  portRange: string;
  ip: string;
}

const EMPTY: NodeForm = {
  name: "",
  description: "",
  fqdn: "",
  scheme: "https",
  daemonPort: "8080",
  sftpPort: "2022",
  memoryMb: "16384",
  diskMb: "204800",
  cpuCores: "8",
  locationId: "",
  publicNode: true,
  portRange: "25565-25585",
  ip: "0.0.0.0",
};

function NodesPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<NodeForm>(EMPTY);
  const [configFor, setConfigFor] = useState<string | null>(null);

  const set = <K extends keyof NodeForm>(key: K, value: NodeForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const nodes = useQuery({
    queryKey: queryKeys.nodes.list(),
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("nodes")
        .select(
          "id, name, description, fqdn, scheme, daemon_port, daemon_sftp_port, daemon_token, daemon_token_id, status, maintenance_mode, public_node, memory_mb, disk_mb, cpu_cores, last_heartbeat_at",
        )
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const locations = useQuery({
    queryKey: queryKeys.locations,
    queryFn: async () => {
      const { data, error } = await supabase.from("locations").select("id, short_code, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async (values: NodeForm) => {
      const { data, error } = await supabase
        .from("nodes")
        .insert({
          name: values.name.trim(),
          description: values.description.trim() || null,
          fqdn: values.fqdn.trim(),
          scheme: values.scheme,
          daemon_port: Number(values.daemonPort),
          daemon_sftp_port: Number(values.sftpPort),
          memory_mb: Number(values.memoryMb),
          disk_mb: Number(values.diskMb),
          cpu_cores: Number(values.cpuCores),
          location_id: values.locationId || null,
          public_node: values.publicNode,
          status: "unknown" as const,
        })
        .select("id")
        .single();
      if (error) throw error;

      const parts = values.portRange.split("-").map((part) => Number(part.trim()));
      const from = parts[0] ?? NaN;
      const to = parts[1] ?? NaN;
      if (Number.isFinite(from) && Number.isFinite(to) && to >= from && to - from <= 500) {
        const rows: { node_id: string; ip: string; port: number; is_primary: boolean }[] = [];
        for (let port = from; port <= to; port += 1) {
          rows.push({ node_id: data.id, ip: values.ip.trim() || "0.0.0.0", port, is_primary: false });
        }
        await supabase.from("allocations").insert(rows);
      }
      return data.id;
    },
    onSuccess: (id) => {
      setOpen(false);
      setForm(EMPTY);
      setConfigFor(id);
      toast.success("Node registered — copy its configuration onto the host");
      void queryClient.invalidateQueries({ queryKey: queryKeys.nodes.all });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("nodes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Node removed from the panel");
      void queryClient.invalidateQueries({ queryKey: queryKeys.nodes.all });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const selected = nodes.data?.find((node) => node.id === configFor) ?? null;
  const valid = form.name.trim().length > 1 && form.fqdn.trim().length > 3;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Nodes"
        description="Machines running the Oryz daemon. Each node owns its servers' data and keeps them running when the panel is offline."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">Create node</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Register a node</DialogTitle>
                <DialogDescription>
                  Register the host here, then paste the generated configuration onto the machine.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4">
                <Field label="Name" id="n-name">
                  <Input id="n-name" value={form.name} maxLength={60} onChange={(e) => set("name", e.target.value)} />
                </Field>
                <Field label="Public FQDN or IP" id="n-fqdn">
                  <Input
                    id="n-fqdn"
                    value={form.fqdn}
                    maxLength={120}
                    placeholder="node1.example.com"
                    onChange={(e) => set("fqdn", e.target.value)}
                  />
                </Field>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Scheme" id="n-scheme">
                    <Select value={form.scheme} onValueChange={(v) => set("scheme", v)}>
                      <SelectTrigger id="n-scheme">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="https">https</SelectItem>
                        <SelectItem value="http">http</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Daemon port" id="n-port">
                    <Input
                      id="n-port"
                      value={form.daemonPort}
                      onChange={(e) => set("daemonPort", e.target.value.replace(/\D/g, ""))}
                    />
                  </Field>
                  <Field label="SFTP port" id="n-sftp">
                    <Input
                      id="n-sftp"
                      value={form.sftpPort}
                      onChange={(e) => set("sftpPort", e.target.value.replace(/\D/g, ""))}
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Memory (MB)" id="n-mem">
                    <Input
                      id="n-mem"
                      value={form.memoryMb}
                      onChange={(e) => set("memoryMb", e.target.value.replace(/\D/g, ""))}
                    />
                  </Field>
                  <Field label="Disk (MB)" id="n-disk">
                    <Input
                      id="n-disk"
                      value={form.diskMb}
                      onChange={(e) => set("diskMb", e.target.value.replace(/\D/g, ""))}
                    />
                  </Field>
                  <Field label="vCPU" id="n-cpu">
                    <Input
                      id="n-cpu"
                      value={form.cpuCores}
                      onChange={(e) => set("cpuCores", e.target.value.replace(/[^\d.]/g, ""))}
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Allocation IP" id="n-ip">
                    <Input id="n-ip" value={form.ip} onChange={(e) => set("ip", e.target.value)} />
                  </Field>
                  <Field label="Port range" id="n-range">
                    <Input
                      id="n-range"
                      value={form.portRange}
                      placeholder="25565-25585"
                      onChange={(e) => set("portRange", e.target.value)}
                    />
                  </Field>
                </div>
                <Field label="Location" id="n-loc">
                  <Select value={form.locationId} onValueChange={(v) => set("locationId", v)}>
                    <SelectTrigger id="n-loc">
                      <SelectValue placeholder="Optional" />
                    </SelectTrigger>
                    <SelectContent>
                      {locations.data?.map((location) => (
                        <SelectItem key={location.id} value={location.id}>
                          {location.short_code} · {location.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Description" id="n-desc">
                  <Textarea
                    id="n-desc"
                    rows={2}
                    maxLength={300}
                    value={form.description}
                    onChange={(e) => set("description", e.target.value)}
                  />
                </Field>
                <div className="flex items-center justify-between">
                  <Label htmlFor="n-public">Available for public deployments</Label>
                  <Switch
                    id="n-public"
                    checked={form.publicNode}
                    onCheckedChange={(value) => set("publicNode", value)}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button disabled={!valid || create.isPending} onClick={() => create.mutate(form)}>
                  Register node
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {nodes.isLoading && <Skeleton className="h-40 w-full" />}

      {!nodes.isLoading && (nodes.data?.length ?? 0) === 0 && (
        <Card>
          <CardContent className="space-y-3 py-14 text-center">
            <p className="text-sm text-muted-foreground">No nodes registered yet.</p>
            <p className="text-xs text-muted-foreground">
              Install the daemon on a host with:
              <br />
              <code className="font-mono">{nodeBootstrapCommand()}</code>
            </p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {nodes.data?.map((node) => {
          const stale =
            !node.last_heartbeat_at ||
            Date.now() - new Date(node.last_heartbeat_at).getTime() > 2 * 60 * 1000;
          const state = node.maintenance_mode ? "maintenance" : stale ? "offline" : "online";
          return (
            <Card key={node.id}>
              <CardContent className="flex flex-wrap items-center gap-4 p-4">
                <ServerIcon className="size-4 text-muted-foreground" />
                <div className="min-w-48 flex-1">
                  <p className="text-sm font-medium">{node.name}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {node.scheme}://{node.fqdn}:{node.daemon_port}
                  </p>
                </div>
                <div className="tnum text-xs text-muted-foreground">
                  {node.cpu_cores} vCPU · {formatMegabytes(node.memory_mb)} RAM ·{" "}
                  {formatMegabytes(node.disk_mb)} disk
                </div>
                <div className="text-xs text-muted-foreground">
                  heartbeat {formatRelative(node.last_heartbeat_at)}
                </div>
                <Badge
                  variant="outline"
                  className={
                    state === "online"
                      ? "border-success/30 bg-success/15 text-success"
                      : state === "maintenance"
                        ? "border-warning/30 bg-warning/15 text-warning"
                        : "text-muted-foreground"
                  }
                >
                  {state}
                </Badge>
                <Button size="sm" variant="outline" onClick={() => setConfigFor(node.id)}>
                  Configuration
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  onClick={() => {
                    if (window.confirm(`Remove ${node.name} from this panel?`)) remove.mutate(node.id);
                  }}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={Boolean(selected)} onOpenChange={(value) => !value && setConfigFor(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Node configuration</DialogTitle>
            <DialogDescription>
              Run the command below on the node host, then paste this configuration when prompted. The node can
              be pointed at any panel later by editing <span className="font-mono">remote.url</span>.
            </DialogDescription>
          </DialogHeader>

          {selected && (
            <div className="space-y-4">
              <CopyBlock label="1. Install the daemon" value={nodeBootstrapCommand()} />
              <CopyBlock
                label="2. Write /etc/oryz-wings/config.yml"
                value={buildNodeConfig(selected)}
                multiline
              />
              <p className="text-xs text-muted-foreground">
                Then start it with <code className="font-mono">sudo systemctl enable --now oryz-wings</code>.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function CopyBlock({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            void navigator.clipboard.writeText(value);
            toast.success("Copied to clipboard");
          }}
        >
          <Copy className="size-3.5" /> Copy
        </Button>
      </div>
      <pre
        className={`overflow-x-auto rounded-lg bg-muted/60 p-3 font-mono text-[11.5px] leading-relaxed ${
          multiline ? "max-h-72 overflow-y-auto" : ""
        }`}
      >
        {value}
      </pre>
    </div>
  );
}
