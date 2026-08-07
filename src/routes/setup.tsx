import { createFileRoute, notFound } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  CircleDashed,
  Database,
  HardDrive,
  Mail,
  Server,
  ShieldCheck,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { finalizeSetup, getSetupStatus, testConnection } from "@/lib/setup.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/setup")({
  head: () => ({
    meta: [
      { title: "First-run setup — Oryz Panel" },
      { name: "description", content: "Configure your Oryz Panel installation: database, cache, storage, email and the first administrator account." },
      { property: "og:title", content: "First-run setup — Oryz Panel" },
      { property: "og:description", content: "Guided first-run configuration for a self-hosted Oryz Panel installation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SetupWizard,
});

const STEPS = [
  { id: "system", label: "System check", icon: ShieldCheck },
  { id: "database", label: "Database", icon: Database },
  { id: "redis", label: "Cache & queues", icon: Server },
  { id: "storage", label: "Storage", icon: HardDrive },
  { id: "smtp", label: "Email", icon: Mail },
  { id: "admin", label: "Administrator", icon: Check },
] as const;

function SetupWizard() {
  const fetchStatus = useServerFn(getSetupStatus);
  const status = useQuery({ queryKey: ["setup", "status"], queryFn: () => fetchStatus({}) });
  const [stepIndex, setStepIndex] = useState(0);

  if (status.data?.complete) throw notFound();

  const step = STEPS[stepIndex]!;

  return (
    <main className="min-h-screen bg-background px-6 py-12">
      <div className="mx-auto max-w-4xl">
        <header className="mb-10">
          <Badge variant="outline" className="mb-3">First-run setup</Badge>
          <h1 className="text-3xl font-semibold tracking-tight">Configure Oryz Panel</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            This wizard runs only while the panel is unconfigured and disables itself
            permanently once finished. Installing system services, certificates and a
            reverse proxy still requires the shell installer.
          </p>
        </header>

        <div className="grid gap-8 md:grid-cols-[220px_1fr]">
          <nav aria-label="Setup steps" className="space-y-1">
            {STEPS.map((entry, index) => {
              const Icon = entry.icon;
              const state = index < stepIndex ? "done" : index === stepIndex ? "current" : "todo";
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => index <= stepIndex && setStepIndex(index)}
                  disabled={index > stepIndex}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                    state === "current" && "bg-secondary font-medium text-secondary-foreground",
                    state === "done" && "text-muted-foreground hover:bg-secondary/60",
                    state === "todo" && "text-muted-foreground/60",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-6 shrink-0 place-items-center rounded-md border",
                      state === "done" && "border-transparent bg-primary text-primary-foreground",
                    )}
                  >
                    {state === "done" ? <Check className="size-3.5" /> : <Icon className="size-3.5" />}
                  </span>
                  {entry.label}
                </button>
              );
            })}
          </nav>

          <div>
            {status.isLoading && <Skeleton className="h-72 w-full" />}

            {status.data && step.id === "system" && (
              <SystemStep checks={status.data.checks} blocking={status.data.blocking} onNext={() => setStepIndex(1)} />
            )}
            {step.id === "database" && (
              <ConnectionStep
                target="database"
                title="Database"
                description="PostgreSQL stores every panel record. The connection is verified before you continue."
                fields={[
                  { name: "host", label: "Host", placeholder: "127.0.0.1" },
                  { name: "port", label: "Port", placeholder: "5432" },
                  { name: "name", label: "Database", placeholder: "oryz" },
                  { name: "user", label: "User", placeholder: "oryz" },
                  { name: "password", label: "Password", type: "password" },
                ]}
                onNext={() => setStepIndex(2)}
              />
            )}
            {step.id === "redis" && (
              <ConnectionStep
                target="redis"
                title="Cache and queues"
                description="Redis backs sessions, the job queue and the scheduler."
                fields={[
                  { name: "host", label: "Host", placeholder: "127.0.0.1" },
                  { name: "port", label: "Port", placeholder: "6379" },
                  { name: "password", label: "Password", type: "password", optional: true },
                  { name: "db", label: "Database index", placeholder: "0" },
                ]}
                onNext={() => setStepIndex(3)}
              />
            )}
            {step.id === "storage" && (
              <ConnectionStep
                target="storage"
                title="Storage"
                description="Where backups and uploaded assets are kept. Leave the S3 fields blank to use local disk."
                fields={[
                  { name: "path", label: "Local path", placeholder: "/var/lib/oryz/storage" },
                  { name: "bucket", label: "S3 bucket", optional: true },
                  { name: "endpoint", label: "S3 endpoint", optional: true },
                  { name: "accessKey", label: "S3 access key", optional: true },
                  { name: "secretKey", label: "S3 secret key", type: "password", optional: true },
                ]}
                onNext={() => setStepIndex(4)}
              />
            )}
            {step.id === "smtp" && (
              <ConnectionStep
                target="smtp"
                title="Outbound email"
                description="Used for password resets and notifications. You can skip this and configure it later."
                skippable
                fields={[
                  { name: "host", label: "SMTP host", placeholder: "smtp.example.com" },
                  { name: "port", label: "Port", placeholder: "587" },
                  { name: "username", label: "Username", optional: true },
                  { name: "password", label: "Password", type: "password", optional: true },
                  { name: "from", label: "From address", placeholder: "no-reply@example.com" },
                ]}
                onNext={() => setStepIndex(5)}
              />
            )}
            {step.id === "admin" && <AdminStep />}
          </div>
        </div>
      </div>
    </main>
  );
}

function StatusIcon({ status }: { status: "pass" | "warn" | "fail" }) {
  if (status === "pass") return <Check className="size-4 text-primary" aria-hidden />;
  if (status === "warn") return <AlertTriangle className="size-4 text-muted-foreground" aria-hidden />;
  return <X className="size-4 text-destructive" aria-hidden />;
}

function SystemStep({
  checks,
  blocking,
  onNext,
}: {
  checks: { id: string; label: string; status: "pass" | "warn" | "fail"; detail: string; remedy?: string }[];
  blocking: number;
  onNext: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>System check</CardTitle>
        <CardDescription>
          Everything the panel needs before it can be configured.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="divide-y rounded-lg border">
          {checks.map((check) => (
            <li key={check.id} className="flex items-start gap-3 p-3">
              <span className="mt-0.5"><StatusIcon status={check.status} /></span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{check.label}</p>
                <p className="text-xs text-muted-foreground">{check.detail}</p>
                {check.remedy && (
                  <p className="mt-1 font-mono text-xs text-muted-foreground">{check.remedy}</p>
                )}
              </div>
            </li>
          ))}
        </ul>

        {blocking > 0 ? (
          <p className="text-sm text-destructive">
            {blocking} blocking problem{blocking === 1 ? "" : "s"} must be resolved before continuing.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">All required checks passed.</p>
        )}

        <Button onClick={onNext} disabled={blocking > 0}>
          Continue <ChevronRight className="size-4" />
        </Button>
      </CardContent>
    </Card>
  );
}

interface FieldSpec {
  name: string;
  label: string;
  placeholder?: string;
  type?: string;
  optional?: boolean;
}

function ConnectionStep({
  target,
  title,
  description,
  fields,
  onNext,
  skippable,
}: {
  target: "database" | "redis" | "storage" | "smtp";
  title: string;
  description: string;
  fields: FieldSpec[];
  onNext: () => void;
  skippable?: boolean;
}) {
  const runTest = useServerFn(testConnection);
  const test = useMutation({ mutationFn: () => runTest({ data: { target } }) });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map((field) => (
            <div key={field.name} className="space-y-1.5">
              <Label htmlFor={`${target}-${field.name}`}>
                {field.label}
                {field.optional && <span className="ml-1 text-xs text-muted-foreground">optional</span>}
              </Label>
              <Input
                id={`${target}-${field.name}`}
                type={field.type ?? "text"}
                placeholder={field.placeholder}
                autoComplete="off"
              />
            </div>
          ))}
        </div>

        <Separator />

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={() => test.mutate()} disabled={test.isPending}>
            {test.isPending ? <CircleDashed className="size-4 animate-spin" /> : null}
            Test connection
          </Button>
          <Button onClick={onNext}>
            Continue <ChevronRight className="size-4" />
          </Button>
          {skippable && (
            <Button variant="ghost" onClick={onNext}>
              Skip for now
            </Button>
          )}
          {test.data && (
            <span className={cn("text-sm", test.data.ok ? "text-primary" : "text-destructive")}>
              {test.data.message}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function AdminStep() {
  const finalize = useServerFn(finalizeSetup);
  const [adminEmail, setAdminEmail] = useState("");
  const [adminName, setAdminName] = useState("");
  const submit = useMutation({ mutationFn: () => finalize({ data: { adminEmail, adminName } }) });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Administrator account</CardTitle>
        <CardDescription>
          The first account, with full access. Use a password of at least 12 characters.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="admin-email">Email</Label>
            <Input
              id="admin-email"
              type="email"
              value={adminEmail}
              onChange={(event) => setAdminEmail(event.target.value)}
              autoComplete="email"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="admin-name">Display name</Label>
            <Input
              id="admin-name"
              value={adminName}
              onChange={(event) => setAdminName(event.target.value)}
              autoComplete="name"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="admin-password">Password</Label>
            <Input id="admin-password" type="password" autoComplete="new-password" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="admin-password-confirm">Confirm password</Label>
            <Input id="admin-password-confirm" type="password" autoComplete="new-password" />
          </div>
        </div>

        <Separator />

        <Button
          onClick={() => submit.mutate()}
          disabled={submit.isPending || !adminEmail || !adminName}
        >
          {submit.isPending ? <CircleDashed className="size-4 animate-spin" /> : null}
          Finish setup
        </Button>

        {submit.data && (
          <div className="rounded-lg border bg-muted/40 p-4">
            <p className="text-sm font-medium">Final step</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Writing configuration requires root, which the panel service account does not
              have. Run this on the host to complete setup:
            </p>
            <pre className="mt-3 overflow-x-auto rounded-md bg-background p-3 font-mono text-xs">
              {submit.data.message}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
