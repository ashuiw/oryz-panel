import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { PageHeader } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { recordAudit } from "@/lib/audit";
import { formatDateTime, formatRelative } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";

export const Route = createFileRoute("/_authenticated/account/security")({
  head: () => ({
    meta: [
      { title: "Security — Oryz Panel" },
      { name: "description", content: "Change your password and review active sessions." },
    ],
  }),
  component: SecurityPage,
});

const passwordSchema = z
  .object({
    password: z.string().min(8, "Use at least 8 characters").max(128),
    confirm: z.string(),
  })
  .refine((value) => value.password === value.confirm, { message: "Passwords do not match" });

function SecurityPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);

  const sessions = useQuery({
    queryKey: queryKeys.sessions,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_sessions")
        .select("id, ip_address, user_agent, device_label, last_active_at, created_at")
        .order("last_active_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    const parsed = passwordSchema.safeParse({ password, confirm });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]!.message);
      return;
    }
    setPending(true);
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    setPending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await recordAudit({ action: "auth.password_changed", resourceType: "profile" });
    setPassword("");
    setConfirm("");
    toast.success("Password updated");
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="Security" description="Credentials and active sessions." />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Change password</CardTitle>
          <CardDescription>You stay signed in on this device.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={changePassword}>
            <div className="space-y-1.5">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password">Confirm password</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={pending}>
                Update password
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sessions</CardTitle>
          <CardDescription>Devices that recently used your account.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(sessions.data?.length ?? 0) === 0 && (
            <p className="text-sm text-muted-foreground">No session records yet.</p>
          )}
          {sessions.data?.map((session) => (
            <div key={session.id} className="flex items-center gap-3 border-b border-border pb-3 last:border-0 last:pb-0">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{session.device_label ?? session.user_agent ?? "Unknown device"}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {session.ip_address ?? "unknown IP"} · started {formatDateTime(session.created_at)}
                </p>
              </div>
              <span className="text-xs text-muted-foreground">{formatRelative(session.last_active_at)}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
