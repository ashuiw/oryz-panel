import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { KeyRound, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/app-shell";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccess } from "@/hooks/use-access";
import {
  adminCreateUser,
  adminDeleteUser,
  adminListUsers,
  adminResetPassword,
  adminSetUserRole,
} from "@/lib/admin.functions";
import { formatDateTime, initialsOf } from "@/lib/format";
import { APP_ROLES, ROLE_LABELS, type AppRole } from "@/lib/permissions";
import { queryKeys } from "@/lib/query-keys";

export const Route = createFileRoute("/_authenticated/admin/users")({
  head: () => ({
    meta: [
      { title: "Users — Oryz Panel" },
      { name: "description", content: "Create accounts, assign roles and manage everyone on this panel." },
      { property: "og:title", content: "Users — Oryz Panel" },
      { property: "og:description", content: "Account and role administration for Oryz Panel." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: UsersPage,
});

interface UserForm {
  email: string;
  password: string;
  displayName: string;
  username: string;
  role: AppRole;
}

const EMPTY: UserForm = {
  email: "",
  password: "",
  displayName: "",
  username: "",
  role: "user",
};

function UsersPage() {
  const queryClient = useQueryClient();
  const access = useAccess();
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<UserForm>(EMPTY);
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const set = <K extends keyof UserForm>(key: K, value: UserForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const query = useQuery({
    queryKey: queryKeys.users.list(),
    queryFn: () => adminListUsers(),
  });

  const create = useMutation({
    mutationFn: (values: UserForm) => adminCreateUser({ data: values }),
    onSuccess: () => {
      setOpen(false);
      setForm(EMPTY);
      toast.success("Account created");
      void queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const setRole = useMutation({
    mutationFn: (input: { userId: string; role: AppRole }) => adminSetUserRole({ data: input }),
    onSuccess: () => {
      toast.success("Role updated — the user must sign in again to refresh it");
      void queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (userId: string) => adminDeleteUser({ data: { userId } }),
    onSuccess: () => {
      toast.success("Account deleted");
      void queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const resetPassword = useMutation({
    mutationFn: (input: { userId: string; password: string }) => adminResetPassword({ data: input }),
    onSuccess: () => {
      setResetFor(null);
      setNewPassword("");
      toast.success("Password updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const people = (query.data?.profiles ?? []).filter((person) =>
    `${person.display_name ?? ""} ${person.email ?? ""} ${person.username ?? ""}`
      .toLowerCase()
      .includes(term.trim().toLowerCase()),
  );

  const valid =
    /.+@.+\..+/.test(form.email) &&
    form.password.length >= 8 &&
    form.displayName.trim().length > 0 &&
    /^[a-zA-Z0-9_.-]{2,40}$/.test(form.username);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Users"
        description="Everyone with an account on this panel."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">Create user</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create an account</DialogTitle>
                <DialogDescription>
                  The account is created confirmed, so the person can sign in immediately.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="u-name">Display name</Label>
                  <Input
                    id="u-name"
                    value={form.displayName}
                    maxLength={80}
                    onChange={(e) => set("displayName", e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="u-username">Username</Label>
                  <Input
                    id="u-username"
                    value={form.username}
                    maxLength={40}
                    onChange={(e) => set("username", e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="u-email">Email</Label>
                  <Input
                    id="u-email"
                    type="email"
                    value={form.email}
                    maxLength={200}
                    onChange={(e) => set("email", e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="u-pass">Password</Label>
                  <Input
                    id="u-pass"
                    type="password"
                    value={form.password}
                    maxLength={200}
                    onChange={(e) => set("password", e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="u-role">Role</Label>
                  <Select value={form.role} onValueChange={(value) => set("role", value as AppRole)}>
                    <SelectTrigger id="u-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {APP_ROLES.map((role) => (
                        <SelectItem key={role} value={role}>
                          {ROLE_LABELS[role]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button disabled={!valid || create.isPending} onClick={() => create.mutate(form)}>
                  Create account
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <Input
        value={term}
        maxLength={80}
        onChange={(event) => setTerm(event.target.value)}
        placeholder="Filter by name, username or email"
        className="mb-4 max-w-sm"
      />

      {query.isLoading && <Skeleton className="h-40 w-full" />}
      {query.isError && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-destructive">
            {(query.error as Error).message}
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {people.map((person) => {
          const name = person.display_name ?? person.username ?? person.email ?? "Unnamed";
          const currentRole =
            ((query.data?.roles ?? []).find((entry) => entry.user_id === person.id)?.role as AppRole) ??
            "guest";
          const isSelf = person.id === access.user?.id;

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
                <span className="hidden text-xs text-muted-foreground lg:block">
                  {formatDateTime(person.created_at)}
                </span>
                {isSelf ? (
                  <Badge variant="secondary">{ROLE_LABELS[currentRole]} (you)</Badge>
                ) : (
                  <Select
                    value={currentRole}
                    onValueChange={(value) => setRole.mutate({ userId: person.id, role: value as AppRole })}
                  >
                    <SelectTrigger className="h-8 w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {APP_ROLES.map((role) => (
                        <SelectItem key={role} value={role}>
                          {ROLE_LABELS[role]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  title="Set a new password"
                  onClick={() => setResetFor(person.id)}
                >
                  <KeyRound className="size-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  disabled={isSelf}
                  onClick={() => {
                    if (window.confirm(`Delete ${name}? This removes their account permanently.`)) {
                      remove.mutate(person.id);
                    }
                  }}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={Boolean(resetFor)} onOpenChange={(value) => !value && setResetFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set a new password</DialogTitle>
            <DialogDescription>The user can sign in with this password immediately.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="u-newpass">New password</Label>
            <Input
              id="u-newpass"
              type="password"
              value={newPassword}
              maxLength={200}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              disabled={newPassword.length < 8 || resetPassword.isPending}
              onClick={() => resetPassword.mutate({ userId: resetFor!, password: newPassword })}
            >
              Update password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
