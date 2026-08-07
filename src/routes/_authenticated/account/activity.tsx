import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { PageHeader } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime, formatRelative } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";

export const Route = createFileRoute("/_authenticated/account/activity")({
  head: () => ({
    meta: [
      { title: "Activity — Oryz Panel" },
      { name: "description", content: "Recent actions recorded against your account." },
    ],
  }),
  component: ActivityPage,
});

function ActivityPage() {
  const query = useQuery({
    queryKey: queryKeys.auditLogs({ scope: "self" }),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("id, action, resource_type, resource_id, ip_address, created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Activity" description="An append-only record of what happened on your account." />

      {query.isLoading && <Skeleton className="h-64 w-full" />}

      {!query.isLoading && (query.data?.length ?? 0) === 0 && (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            No activity recorded yet.
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {query.data?.map((entry) => (
          <Card key={entry.id}>
            <CardContent className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{entry.action.replace(/[._]/g, " ")}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {entry.resource_type ?? "system"}
                  {entry.resource_id ? ` · ${entry.resource_id}` : ""}
                  {entry.ip_address ? ` · ${entry.ip_address}` : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs">{formatRelative(entry.created_at)}</p>
                <p className="text-[11px] text-muted-foreground">{formatDateTime(entry.created_at)}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
