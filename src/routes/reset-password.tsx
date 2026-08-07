import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { recordAudit } from "@/lib/audit";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Reset password — Oryz Panel" },
      { name: "description", content: "Choose a new password for your Oryz account." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});

const schema = z
  .object({
    password: z.string().min(8, "Use at least 8 characters").max(128),
    confirm: z.string(),
  })
  .refine((value) => value.password === value.confirm, { message: "Passwords do not match" });

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = schema.safeParse({ password, confirm });
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
    await recordAudit({ action: "auth.password_reset", resourceType: "profile" });
    toast.success("Password updated");
    void navigate({ to: "/dashboard", replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <form onSubmit={submit} className="panel w-full max-w-sm space-y-4 rounded-xl p-6">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Set a new password</h1>
          <p className="text-sm text-muted-foreground">Open this page from your reset email link.</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">New password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={128}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirm">Confirm password</Label>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={128}
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
        </div>

        <Button type="submit" className="w-full" disabled={pending}>
          Update password
        </Button>
      </form>
    </div>
  );
}
