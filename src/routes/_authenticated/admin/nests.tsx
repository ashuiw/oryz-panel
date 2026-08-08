import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { queryKeys } from "@/lib/query-keys";

export const Route = createFileRoute("/_authenticated/admin/nests")({
  head: () => ({
    meta: [
      { title: "Nests & eggs — Oryz Panel" },
      { name: "description", content: "Game templates, startup commands and container images." },
      { property: "og:title", content: "Nests & eggs — Oryz Panel" },
      { property: "og:description", content: "Manage the server templates available on this panel." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NestsPage,
});

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function NestsPage() {
  const queryClient = useQueryClient();
  const [nestOpen, setNestOpen] = useState(false);
  const [eggOpen, setEggOpen] = useState(false);
  const [nestName, setNestName] = useState("");
  const [nestDescription, setNestDescription] = useState("");

  const [egg, setEgg] = useState({
    nestId: "",
    name: "",
    description: "",
    image: "eclipse-temurin:21-jre",
    startup: "java -Xms128M -Xmx{{SERVER_MEMORY}}M -jar {{SERVER_JARFILE}} nogui",
    stop: "stop",
  });

  const query = useQuery({
    queryKey: queryKeys.nests,
    queryFn: async () => {
      const [nests, eggs, variables] = await Promise.all([
        supabase.from("nests").select("id, name, description, author").order("name"),
        supabase
          .from("eggs")
          .select("id, nest_id, name, description, slug, docker_images, startup")
          .order("name"),
        supabase.from("egg_variables").select("id, egg_id, name, env_variable, default_value"),
      ]);
      if (nests.error) throw nests.error;
      if (eggs.error) throw eggs.error;
      return { nests: nests.data, eggs: eggs.data, variables: variables.data ?? [] };
    },
  });

  const createNest = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("nests").insert({
        name: nestName.trim(),
        slug: slugify(nestName),
        description: nestDescription.trim() || null,
        author: "Oryz Panel",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNestOpen(false);
      setNestName("");
      setNestDescription("");
      toast.success("Nest created");
      void queryClient.invalidateQueries({ queryKey: queryKeys.nests });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const createEgg = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("eggs").insert({
        nest_id: egg.nestId,
        name: egg.name.trim(),
        slug: slugify(egg.name),
        description: egg.description.trim() || null,
        docker_images: { Default: egg.image } as never,
        startup: egg.startup,
        stop_command: egg.stop,
        config_files: {} as never,
        config_startup: {} as never,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setEggOpen(false);
      setEgg((prev) => ({ ...prev, name: "", description: "" }));
      toast.success("Egg created");
      void queryClient.invalidateQueries({ queryKey: queryKeys.nests });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeEgg = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("eggs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Egg removed");
      void queryClient.invalidateQueries({ queryKey: queryKeys.nests });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (query.isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Nests & eggs"
        description="Reusable templates used when deploying servers."
        actions={
          <div className="flex gap-2">
            <Dialog open={nestOpen} onOpenChange={setNestOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">
                  New nest
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create a nest</DialogTitle>
                  <DialogDescription>A nest groups related server templates.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="nest-name">Name</Label>
                    <Input
                      id="nest-name"
                      value={nestName}
                      maxLength={60}
                      onChange={(e) => setNestName(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="nest-desc">Description</Label>
                    <Textarea
                      id="nest-desc"
                      rows={2}
                      maxLength={300}
                      value={nestDescription}
                      onChange={(e) => setNestDescription(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button disabled={!nestName.trim() || createNest.isPending} onClick={() => createNest.mutate()}>
                    Create nest
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={eggOpen} onOpenChange={setEggOpen}>
              <DialogTrigger asChild>
                <Button size="sm" disabled={(query.data?.nests.length ?? 0) === 0}>
                  New egg
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Create an egg</DialogTitle>
                  <DialogDescription>
                    An egg describes the container image and startup command the node uses for a server.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="egg-nest">Nest</Label>
                    <Select value={egg.nestId} onValueChange={(value) => setEgg({ ...egg, nestId: value })}>
                      <SelectTrigger id="egg-nest">
                        <SelectValue placeholder="Select a nest" />
                      </SelectTrigger>
                      <SelectContent>
                        {query.data?.nests.map((nest) => (
                          <SelectItem key={nest.id} value={nest.id}>
                            {nest.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="egg-name">Name</Label>
                    <Input
                      id="egg-name"
                      value={egg.name}
                      maxLength={60}
                      onChange={(e) => setEgg({ ...egg, name: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="egg-image">Container image</Label>
                    <Input
                      id="egg-image"
                      value={egg.image}
                      maxLength={120}
                      onChange={(e) => setEgg({ ...egg, image: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="egg-startup">Startup command</Label>
                    <Textarea
                      id="egg-startup"
                      rows={3}
                      value={egg.startup}
                      onChange={(e) => setEgg({ ...egg, startup: e.target.value })}
                      className="font-mono text-xs"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="egg-stop">Stop command</Label>
                    <Input
                      id="egg-stop"
                      value={egg.stop}
                      maxLength={40}
                      onChange={(e) => setEgg({ ...egg, stop: e.target.value })}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    disabled={!egg.nestId || !egg.name.trim() || createEgg.isPending}
                    onClick={() => createEgg.mutate()}
                  >
                    Create egg
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      {(query.data?.nests.length ?? 0) === 0 && (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            No nests configured yet.
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {query.data?.nests.map((nest) => {
          const eggs = query.data.eggs.filter((item) => item.nest_id === nest.id);
          return (
            <Card key={nest.id}>
              <CardHeader>
                <CardTitle className="text-base">{nest.name}</CardTitle>
                <CardDescription>{nest.description ?? nest.author}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {eggs.length === 0 && <p className="text-sm text-muted-foreground">No eggs in this nest.</p>}
                {eggs.map((item) => {
                  const vars = query.data.variables.filter((variable) => variable.egg_id === item.id);
                  return (
                    <div key={item.id} className="rounded-lg bg-muted/40 px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{item.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{item.description}</p>
                        </div>
                        <Badge variant="secondary" className="font-mono text-[11px]">
                          {item.slug}
                        </Badge>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          onClick={() => {
                            if (window.confirm(`Delete the ${item.name} egg?`)) removeEgg.mutate(item.id);
                          }}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                      {vars.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {vars.map((variable) => (
                            <Badge key={variable.id} variant="outline" className="font-mono text-[10.5px]">
                              {variable.env_variable}={variable.default_value}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
