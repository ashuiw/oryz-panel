import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { PageHeader } from "@/components/layout/app-shell";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime, initialsOf } from "@/lib/format";
import { ROLE_LABELS, type AppRole } from "@/lib/permissions";
import { queryKeys } from "@/lib/query-keys";

export const Route = createFileRoute("/_authenticated/admin/users")({
  head: () => ({
    meta: [
      { title: "Users — Oryz Panel" },
      { name: "description", content: "Accounts registered on this panel and their assigned roles." },
    ],
  }),
  component: UsersPage,
});

function UsersPage() {
  const [term, setTerm] = useState("");

  const query = useQuery({
    queryKey: queryKeys.users.list(),
    queryFn: async () => {
      const [profiles, roles] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, email, display_name, username, created_at")
          .order("created_at", { ascending: false }),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      if (profiles.error) throw profiles.error;
      return { profiles: profiles.data, roles: roles.data ?? [] };
    },
  });

  const people = (query.data?.profiles ?? []).filter((person) =>
    `${person.display_name ?? ""} ${person.email ?? ""} ${person.username ?? ""}`
      .toLowerCase()
      .includes(term.trim().toLowerCase()),
  );

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Users" description="Everyone with an account on this panel." />

      <Input
        value={term}
        maxLength={80}
        onChange={(event) => setTerm(event.target.value)}
        placeholder="Filter by name, username or email"
        className="mb-4 max-w-sm"
      />

      {query.isLoading && <Skeleton className="h-40 w-full" />}

      <div className="space-y-2">
        {people.map((person) => {
          const name = person.display_name ?? person.username ?? person.email ?? "Unnamed";
          const personRoles = (query.data?.roles ?? [])
            .filter((entry) => entry.user_id === person.id)
            .map((entry) => entry.role as AppRole);

          return (
            <Card key={person.id}>
              <CardContent className="flex flex-wrap items-center gap-3 p-4">
                <Avatar className="size-8">
                  <AvatarFallback className="text-xs">{initialsOf(name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-48 flex-1">
                  <p className="truncate text-sm font-medium">{name}</p>
                  <p className="truncate text-xs text-muted-foreground">{person.email}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {personRoles.length === 0 && <Badge variant="outline">No role</Badge>}
                  {personRoles.map((role) => (
                    <Badge key={role} variant="secondary">
                      {ROLE_LABELS[role]}
                    </Badge>
                  ))}
                </div>
                <span className="text-xs text-muted-foreground">{formatDateTime(person.created_at)}</span>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
