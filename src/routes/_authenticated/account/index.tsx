import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAccess } from "@/hooks/use-access";
import { supabase } from "@/integrations/supabase/client";
import { ROLE_LABELS } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";

export const Route = createFileRoute("/_authenticated/account/")({
  head: () => ({
    meta: [
      { title: "Profile — Oryz Panel" },
      { name: "description", content: "Manage your display name, username and timezone." },
    ],
  }),
  component: AccountPage,
});

const profileSchema = z.object({
  display_name: z.string().trim().min(1, "Display name is required").max(64),
  username: z
    .string()
    .trim()
    .regex(/^[a-z0-9_-]{3,32}$/, "Use 3-32 lowercase letters, numbers, - or _"),
  timezone: z.string().trim().min(1).max(64),
});

function AccountPage() {
  const queryClient = useQueryClient();
  const { profile, roles, user, loading } = useAccess();
  const [form, setForm] = useState({ display_name: "", username: "", timezone: "UTC" });

  useEffect(() => {
    if (!profile) return;
    setForm({
      display_name: profile.display_name ?? "",
      username: profile.username ?? "",
      timezone: profile.timezone ?? "UTC",
    });
  }, [profile]);

  const save = useMutation({
    mutationFn: async () => {
      const parsed = profileSchema.parse(form);
      const { error } = await supabase.from("profiles").update(parsed).eq("id", user!.id);
      if (error) throw error;
      await recordAudit({ action: "profile.updated", resourceType: "profile", resourceId: user!.id });
    },
    onSuccess: async () => {
      toast.success("Profile updated");
      await queryClient.invalidateQueries({ queryKey: ["access"] });
    },
    onError: (error) =>
      toast.error(error instanceof z.ZodError ? error.issues[0]!.message : "Could not save profile"),
  });

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Profile" description="How you appear across the panel." />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account details</CardTitle>
          <CardDescription>{user?.email}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {roles.map((role) => (
              <Badge key={role} variant="secondary">
                {ROLE_LABELS[role]}
              </Badge>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="display_name"
              label="Display name"
              value={form.display_name}
              maxLength={64}
              onChange={(value) => setForm((current) => ({ ...current, display_name: value }))}
            />
            <Field
              id="username"
              label="Username"
              value={form.username}
              maxLength={32}
              onChange={(value) => setForm((current) => ({ ...current, username: value.toLowerCase() }))}
            />
            <Field
              id="timezone"
              label="Timezone"
              value={form.timezone}
              maxLength={64}
              onChange={(value) => setForm((current) => ({ ...current, timezone: value }))}
            />
          </div>

          <Button onClick={() => save.mutate()} disabled={loading || save.isPending}>
            Save changes
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  maxLength,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  maxLength: number;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
