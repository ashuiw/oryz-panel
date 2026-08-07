import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { PageHeader } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccess } from "@/hooks/use-access";
import { supabase } from "@/integrations/supabase/client";
import { recordAudit } from "@/lib/audit";
import { formatDateTime } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";

export const Route = createFileRoute("/_authenticated/account/api")({
  head: () => ({
    meta: [
      { title: "API keys — Oryz Panel" },
      { name: "description", content: "Create and revoke personal API keys for the Oryz API." },
    ],
  }),
  component: ApiKeysPage,
});

const nameSchema = z.string().trim().min(3, "Name must be at least 3 characters").max(64);

/** Keys are shown once; only a SHA-256 digest is stored server-side. */
async function digest(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function ApiKeysPage() {
  const queryClient = useQueryClient();
  const { user } = useAccess();
  const [name, setName] = useState("");
  const [issued, setIssued] = useState<string | null>(null);

  const keys = useQuery({
    queryKey: queryKeys.apiKeys,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("api_keys")
        .select("id, name, key_prefix, last_used_at, created_at, expires_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const parsedName = nameSchema.parse(name);
      const secret = `nbl_${crypto.randomUUID().replace(/-/g, "")}${crypto.randomUUID().replace(/-/g, "")}`;
      const { error } = await supabase.from("api_keys").insert({
        user_id: user!.id,
        name: parsedName,
        key_prefix: secret.slice(0, 12),
        key_hash: await digest(secret),
      });
      if (error) throw error;
      await recordAudit({ action: "apikey.created", resourceType: "api_key" });
      return secret;
    },
    onSuccess: async (secret) => {
      setIssued(secret);
      setName("");
      await queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys });
    },
    onError: (error) =>
      toast.error(error instanceof z.ZodError ? error.issues[0]!.message : "Could not create key"),
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("api_keys").delete().eq("id", id);
      if (error) throw error;
      await recordAudit({ action: "apikey.revoked", resourceType: "api_key", resourceId: id });
    },
    onSuccess: async () => {
      toast.success("API key revoked");
      await queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys });
    },
  });

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="API keys" description="Programmatic access scoped to your account." />

      {issued && (
        <Card className="mb-4 border-success/40 bg-success/5">
          <CardHeader>
            <CardTitle className="text-base">Copy your key now</CardTitle>
            <CardDescription>This is the only time it will be shown.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <code className="block break-all rounded-md bg-background p-3 font-mono text-xs">{issued}</code>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(issued);
                  toast.success("Copied to clipboard");
                }}
              >
                Copy
              </Button>
              <Button size="sm" variant="outline" onClick={() => setIssued(null)}>
                Done
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base">Create a key</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1 space-y-1.5">
            <Label htmlFor="key-name">Key name</Label>
            <Input
              id="key-name"
              value={name}
              maxLength={64}
              placeholder="Deployment bot"
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            Generate key
          </Button>
        </CardContent>
      </Card>

      {keys.isLoading && <Skeleton className="h-32 w-full" />}

      <div className="space-y-2">
        {keys.data?.map((key) => (
          <Card key={key.id}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{key.name}</p>
                <p className="truncate font-mono text-xs text-muted-foreground">
                  {key.key_prefix}··· · created {formatDateTime(key.created_at)}
                </p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="size-8 text-muted-foreground hover:text-destructive"
                onClick={() => revoke.mutate(key.id)}
              >
                <Trash2 className="size-4" />
                <span className="sr-only">Revoke</span>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
