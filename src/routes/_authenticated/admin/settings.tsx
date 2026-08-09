import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useUiStore } from "@/stores/ui-store";
import { supabase } from "@/integrations/supabase/client";
import { recordAudit } from "@/lib/audit";
import { queryKeys } from "@/lib/query-keys";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Oryz Panel" },
      { name: "description", content: "Panel-wide configuration values and interface preferences." },
      { property: "og:title", content: "Settings — Oryz Panel" },
      { property: "og:description", content: "Configure branding, limits and defaults for Oryz Panel." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

type SettingRow = {
  key: string;
  value: unknown;
  category: string;
  label: string | null;
  description: string | null;
  is_public: boolean;
};

/** Values are stored as JSONB — render primitives as plain text for editing. */
function toEditable(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  return JSON.stringify(value);
}

function fromEditable(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed !== "" && !Number.isNaN(Number(trimmed))) return Number(trimmed);
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return raw;
    }
  }
  return raw;
}

function SettingsPage() {
  const queryClient = useQueryClient();
  const density = useUiStore((state) => state.density);
  const setDensity = useUiStore((state) => state.setDensity);
  const [draft, setDraft] = useState<Record<string, string>>({});

  const query = useQuery({
    queryKey: queryKeys.settings,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("settings")
        .select("key, value, category, label, description, is_public")
        .order("category")
        .order("key");
      if (error) throw error;
      return data as SettingRow[];
    },
  });

  useEffect(() => {
    if (!query.data) return;
    setDraft(Object.fromEntries(query.data.map((row) => [row.key, toEditable(row.value)])));
  }, [query.data]);

  const save = useMutation({
    mutationFn: async (row: SettingRow) => {
      const next = fromEditable(draft[row.key] ?? "");
      const { error } = await supabase
        .from("settings")
        .update({ value: next as never })
        .eq("key", row.key);
      if (error) throw error;
      await recordAudit({ action: "settings.update", resourceType: "setting", resourceId: row.key });
    },
    onSuccess: () => {
      toast.success("Setting saved");
      void queryClient.invalidateQueries({ queryKey: queryKeys.settings });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const togglePublic = useMutation({
    mutationFn: async (input: { key: string; isPublic: boolean }) => {
      const { error } = await supabase
        .from("settings")
        .update({ is_public: input.isPublic })
        .eq("key", input.key);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.settings }),
    onError: (error: Error) => toast.error(error.message),
  });

  const categories = [...new Set((query.data ?? []).map((row) => row.category))];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="Settings" description="Configuration that applies to the whole panel." />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Interface</CardTitle>
          <CardDescription>Stored on this device only.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <div>
            <Label htmlFor="density">Compact density</Label>
            <p className="text-xs text-muted-foreground">Tightens spacing across tables and lists.</p>
          </div>
          <Switch
            id="density"
            checked={density === "compact"}
            onCheckedChange={(checked) => setDensity(checked ? "compact" : "comfortable")}
          />
        </CardContent>
      </Card>

      {query.isLoading && <Skeleton className="h-64 w-full" />}

      {!query.isLoading && (query.data?.length ?? 0) === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No platform settings stored yet.
          </CardContent>
        </Card>
      )}

      {categories.map((category) => (
        <Card key={category}>
          <CardHeader>
            <CardTitle className="text-base capitalize">{category}</CardTitle>
            <CardDescription>Values are shared by everyone using this panel.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {query.data
              ?.filter((row) => row.category === category)
              .map((row) => {
                const dirty = (draft[row.key] ?? "") !== toEditable(row.value);
                return (
                  <div key={row.key} className="grid gap-2 border-b border-border pb-4 last:border-0 last:pb-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Label htmlFor={`s-${row.key}`} className="flex-1">
                        {row.label ?? row.key}
                      </Label>
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">{row.key}</code>
                    </div>
                    {row.description && (
                      <p className="text-xs text-muted-foreground">{row.description}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        id={`s-${row.key}`}
                        className="min-w-56 flex-1"
                        value={draft[row.key] ?? ""}
                        maxLength={500}
                        onChange={(event) =>
                          setDraft((prev) => ({ ...prev, [row.key]: event.target.value }))
                        }
                      />
                      <Button size="sm" disabled={!dirty || save.isPending} onClick={() => save.mutate(row)}>
                        Save
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        id={`p-${row.key}`}
                        checked={row.is_public}
                        onCheckedChange={(value) => togglePublic.mutate({ key: row.key, isPublic: value })}
                      />
                      <Label htmlFor={`p-${row.key}`} className="text-xs text-muted-foreground">
                        Readable by signed-out visitors
                      </Label>
                    </div>
                  </div>
                );
              })}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
