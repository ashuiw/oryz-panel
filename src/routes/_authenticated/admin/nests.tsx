import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/query-keys";

export const Route = createFileRoute("/_authenticated/admin/nests")({
  head: () => ({
    meta: [
      { title: "Nests & eggs — Oryz Panel" },
      { name: "description", content: "Game templates, startup commands and container images." },
    ],
  }),
  component: NestsPage,
});

function NestsPage() {
  const query = useQuery({
    queryKey: queryKeys.nests,
    queryFn: async () => {
      const [nests, eggs] = await Promise.all([
        supabase.from("nests").select("id, name, description, author").order("name"),
        supabase.from("eggs").select("id, nest_id, name, description, slug").order("name"),
      ]);
      if (nests.error) throw nests.error;
      if (eggs.error) throw eggs.error;
      return { nests: nests.data, eggs: eggs.data };
    },
  });

  if (query.isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Nests & eggs" description="Reusable templates used when deploying servers." />

      {(query.data?.nests.length ?? 0) === 0 && (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            No nests configured yet.
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {query.data?.nests.map((nest) => {
          const eggs = query.data.eggs.filter((egg) => egg.nest_id === nest.id);
          return (
            <Card key={nest.id}>
              <CardHeader>
                <CardTitle className="text-base">{nest.name}</CardTitle>
                <CardDescription>{nest.description ?? nest.author}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {eggs.length === 0 && <p className="text-sm text-muted-foreground">No eggs in this nest.</p>}
                {eggs.map((egg) => (
                  <div key={egg.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-muted/40 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{egg.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{egg.description}</p>
                    </div>
                    <Badge variant="secondary" className="font-mono text-[11px]">
                      {egg.slug}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
