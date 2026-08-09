import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { MapPin, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/app-shell";
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
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { recordAudit } from "@/lib/audit";
import { queryKeys } from "@/lib/query-keys";

export const Route = createFileRoute("/_authenticated/admin/locations")({
  head: () => ({
    meta: [
      { title: "Locations — Oryz Panel" },
      {
        name: "description",
        content: "Group Oryz Panel nodes into regions so servers can be placed close to their players.",
      },
      { property: "og:title", content: "Locations — Oryz Panel" },
      { property: "og:description", content: "Regions that group the nodes of your fleet." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LocationsPage,
});

interface LocationForm {
  id?: string;
  shortCode: string;
  name: string;
  country: string;
  description: string;
}

const EMPTY: LocationForm = { shortCode: "", name: "", country: "", description: "" };

function LocationsPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<LocationForm>(EMPTY);

  const set = <K extends keyof LocationForm>(key: K, value: LocationForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const locations = useQuery({
    queryKey: queryKeys.locations,
    queryFn: async () => {
      const [list, nodes] = await Promise.all([
        supabase.from("locations").select("id, short_code, name, country, description").order("short_code"),
        supabase.from("nodes").select("id, location_id"),
      ]);
      if (list.error) throw list.error;
      return { list: list.data, nodes: nodes.data ?? [] };
    },
  });

  const save = useMutation({
    mutationFn: async (values: LocationForm) => {
      const payload = {
        short_code: values.shortCode.trim().toLowerCase(),
        name: values.name.trim(),
        country: values.country.trim() || null,
        description: values.description.trim() || null,
      };
      if (values.id) {
        const { error } = await supabase.from("locations").update(payload).eq("id", values.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("locations").insert(payload);
        if (error) throw error;
      }
      await recordAudit({
        action: values.id ? "location.update" : "location.create",
        resourceType: "location",
        resourceId: values.id ?? payload.short_code,
      });
    },
    onSuccess: () => {
      setOpen(false);
      setForm(EMPTY);
      toast.success("Location saved");
      void queryClient.invalidateQueries({ queryKey: queryKeys.locations });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("locations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Location deleted");
      void queryClient.invalidateQueries({ queryKey: queryKeys.locations });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const valid = /^[a-z0-9-]{2,12}$/.test(form.shortCode.trim().toLowerCase()) && form.name.trim().length > 1;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Locations"
        description="Regions that group your nodes. Every node can belong to one location."
        actions={
          <Button
            size="sm"
            onClick={() => {
              setForm(EMPTY);
              setOpen(true);
            }}
          >
            Create location
          </Button>
        }
      />

      {locations.isLoading && <Skeleton className="h-40 w-full" />}

      {!locations.isLoading && (locations.data?.list.length ?? 0) === 0 && (
        <Card>
          <CardContent className="py-14 text-center text-sm text-muted-foreground">
            No locations yet. Create one before registering nodes so you can group them by region.
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {locations.data?.list.map((location) => {
          const used = locations.data.nodes.filter((node) => node.location_id === location.id).length;
          return (
            <Card key={location.id}>
              <CardContent className="flex flex-wrap items-center gap-4 p-4">
                <MapPin className="size-4 text-muted-foreground" />
                <div className="min-w-48 flex-1">
                  <p className="text-sm font-medium">
                    <span className="font-mono text-xs uppercase text-muted-foreground">
                      {location.short_code}
                    </span>{" "}
                    {location.name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {location.description ?? location.country ?? "No description"}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">
                  {used} node{used === 1 ? "" : "s"}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  onClick={() => {
                    setForm({
                      id: location.id,
                      shortCode: location.short_code,
                      name: location.name,
                      country: location.country ?? "",
                      description: location.description ?? "",
                    });
                    setOpen(true);
                  }}
                >
                  <Pencil className="size-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  disabled={used > 0}
                  onClick={() => {
                    if (window.confirm(`Delete ${location.name}?`)) remove.mutate(location.id);
                  }}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit location" : "Create a location"}</DialogTitle>
            <DialogDescription>
              The short code appears next to every node and server placed in this region.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="l-code">Short code</Label>
                <Input
                  id="l-code"
                  value={form.shortCode}
                  maxLength={12}
                  placeholder="eu-west"
                  onChange={(e) => set("shortCode", e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="l-country">Country</Label>
                <Input
                  id="l-country"
                  value={form.country}
                  maxLength={60}
                  placeholder="Germany"
                  onChange={(e) => set("country", e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="l-name">Name</Label>
              <Input
                id="l-name"
                value={form.name}
                maxLength={80}
                placeholder="Frankfurt"
                onChange={(e) => set("name", e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="l-desc">Description</Label>
              <Textarea
                id="l-desc"
                rows={2}
                maxLength={300}
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button disabled={!valid || save.isPending} onClick={() => save.mutate(form)}>
              {form.id ? "Save changes" : "Create location"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
