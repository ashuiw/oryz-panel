import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { PageHeader } from "@/components/layout/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useUiStore } from "@/stores/ui-store";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/query-keys";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Oryz Panel" },
      { name: "description", content: "Panel-wide configuration values and interface preferences." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const density = useUiStore((state) => state.density);
  const setDensity = useUiStore((state) => state.setDensity);

  const query = useQuery({
    queryKey: queryKeys.settings,
    queryFn: async () => {
      const { data, error } = await supabase.from("settings").select("key, value, description").order("key");
      if (error) throw error;
      return data;
    },
  });

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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Platform values</CardTitle>
          <CardDescription>Read from the settings table.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {query.isLoading && <Skeleton className="h-24 w-full" />}
          {!query.isLoading && (query.data?.length ?? 0) === 0 && (
            <p className="text-sm text-muted-foreground">No settings stored yet.</p>
          )}
          {query.data?.map((setting) => (
            <div key={setting.key} className="flex flex-wrap items-center gap-3 border-b border-border pb-2 last:border-0 last:pb-0">
              <code className="font-mono text-xs">{setting.key}</code>
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                {setting.description}
              </span>
              <code className="max-w-48 truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                {JSON.stringify(setting.value)}
              </code>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
