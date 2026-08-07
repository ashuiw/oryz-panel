import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { PageHeader } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";

export const Route = createFileRoute("/_authenticated/admin/audit")({
  head: () => ({
    meta: [
      { title: "Audit log — Oryz Panel" },
      { name: "description", content: "Append-only record of every privileged action on the platform." },
    ],
  }),
  component: AuditPage,
});

function AuditPage() {
  const [term, setTerm] = useState("");

  const query = useQuery({
    queryKey: queryKeys.auditLogs({ scope: "all" }),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("id, action, actor_label, resource_type, resource_id, ip_address, created_at")
        .order("created_at", { ascending: false })
        .limit(250);
      if (error) throw error;
      return data;
    },
  });

  const entries = (query.data ?? []).filter((entry) =>
    `${entry.action} ${entry.actor_label ?? ""} ${entry.resource_type ?? ""}`
      .toLowerCase()
      .includes(term.trim().toLowerCase()),
  );

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Audit log" description="Immutable history of privileged actions." />

      <Input
        value={term}
        maxLength={80}
        onChange={(event) => setTerm(event.target.value)}
        placeholder="Filter by action, actor or resource"
        className="mb-4 max-w-sm"
      />

      {query.isLoading && <Skeleton className="h-64 w-full" />}

      {!query.isLoading && entries.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            No matching audit entries.
          </CardContent>
        </Card>
      )}

      <div className="panel divide-y divide-border overflow-hidden rounded-xl">
        {entries.map((entry) => (
          <div key={entry.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">{entry.action}</code>
            <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
              {entry.actor_label ?? "system"}
              {entry.resource_type ? ` → ${entry.resource_type}` : ""}
              {entry.resource_id ? ` (${entry.resource_id})` : ""}
            </span>
            <span className="text-xs text-muted-foreground">{formatDateTime(entry.created_at)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
