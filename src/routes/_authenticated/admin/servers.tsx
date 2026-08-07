import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { formatMegabytes } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";

export const Route = createFileRoute("/_authenticated/admin/servers")({
  head: () => ({
    meta: [
      { title: "Servers — Oryz Panel" },
      { name: "description", content: "Every server on this panel, and provisioning for any user on any node." },
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
  memoryMb: string;
  diskMb: string;
  cpuPercent: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  description: "",
  ownerId: "",
  nodeId: "",
  eggId: "",
  memoryMb: "2048",
  diskMb: "10240",
  cpuPercent: "100",
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

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const servers = useQuery({
    queryKey: queryKeys.servers.list(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("servers")
        .select("id, identifier, name, status, memory_mb, disk_mb, owner_id, node_id")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const options = useQuery({
    queryKey: ["admin", "server-form-options"],
    queryFn: async () => {
      const [people, nodes, eggs] = await Promise.all([
        supabase.from("profiles").select("id, email, display_name").order("display_name"),
        supabase.from("nodes").select("id, name, fqdn, status, maintenance_mode").order("name"),
        supabase.from("eggs").select("id, name, docker_images, startup").order("name"),
      ]);
      if (people.error) throw people.error;
      if (nodes.error) throw nodes.error;
      if (eggs.error) throw eggs.error;
      return { people: people.data, nodes: nodes.data, eggs: eggs.data };
    },
  });

  const create = useMutation({
    mutationFn: async (values: FormState) => {
      const egg = options.data?.eggs.find((item) => item.id === values.eggId);
      const images = (egg?.docker_images ?? null) as Record<string, string> | null;
      const { error } = await supabase.from("servers").insert({
        identifier: identifierFor(values.name),
        name: values.name.trim(),
        description: values.description.trim() || null,
        owner_id: values.ownerId,
        node_id: values.nodeId || null,
        egg_id: values.eggId || null,
        docker_image: images ? Object.values(images)[0] ?? null : null,
        startup_command: egg?.startup ?? null,
        memory_mb: Number(values.memoryMb),
        disk_mb: Number(values.diskMb),
        cpu_percent: Number(values.cpuPercent),
        status: "installing" as const,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Server queued for installation on its node");
      setForm(EMPTY_FORM);
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: queryKeys.servers.list() });
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
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Create a server</DialogTitle>
                <DialogDescription>
                  The server is created on the selected node and owned by the selected user. Its data lives on
                  that node only.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="srv-name">Name</Label>
                  <Input
                    id="srv-name"
                    value={form.name}
                    maxLength={80}
                    onChange={(event) => set("name", event.target.value)}
                    placeholder="Survival SMP"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="srv-owner">Owner</Label>
                  <Select value={form.ownerId} onValueChange={(value) => set("ownerId", value)}>
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
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="srv-node">Node</Label>
                  <Select value={form.nodeId} onValueChange={(value) => set("nodeId", value)}>
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
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="srv-egg">Egg</Label>
                  <Select value={form.eggId} onValueChange={(value) => set("eggId", value)}>
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
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="grid gap-2">
                    <Label htmlFor="srv-mem">Memory (MB)</Label>
                    <Input
                      id="srv-mem"
                      inputMode="numeric"
                      value={form.memoryMb}
                      onChange={(event) => set("memoryMb", event.target.value.replace(/\D/g, ""))}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="srv-disk">Disk (MB)</Label>
                    <Input
                      id="srv-disk"
                      inputMode="numeric"
                      value={form.diskMb}
                      onChange={(event) => set("diskMb", event.target.value.replace(/\D/g, ""))}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="srv-cpu">CPU (%)</Label>
                    <Input
                      id="srv-cpu"
                      inputMode="numeric"
                      value={form.cpuPercent}
                      onChange={(event) => set("cpuPercent", event.target.value.replace(/\D/g, ""))}
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="srv-desc">Description</Label>
                  <Textarea
                    id="srv-desc"
                    value={form.description}
                    maxLength={500}
                    rows={2}
                    onChange={(event) => set("description", event.target.value)}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button disabled={!valid || create.isPending} onClick={() => create.mutate(form)}>
                  {create.isPending ? "Creating…" : "Create server"}
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
            No servers yet. Create one for any user on any node.
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {servers.data?.map((server) => (
          <Card key={server.id}>
            <CardContent className="flex flex-wrap items-center gap-4 p-4">
              <div className="min-w-48 flex-1">
                <p className="text-sm font-medium">{server.name}</p>
                <p className="truncate font-mono text-xs text-muted-foreground">{server.identifier}</p>
              </div>
              <div className="text-xs text-muted-foreground">{ownerLabel(server.owner_id)}</div>
              <div className="text-xs text-muted-foreground">{nodeLabel(server.node_id)}</div>
              <div className="tnum text-xs text-muted-foreground">
                {formatMegabytes(server.memory_mb)} RAM · {formatMegabytes(server.disk_mb)} disk
              </div>
              <Badge variant="outline" className="capitalize">
                {server.status}
              </Badge>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
