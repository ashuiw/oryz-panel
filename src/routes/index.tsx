import { OryzMark } from "@/components/brand/oryz-mark";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, FileClock, Server, ShieldCheck, Terminal, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Oryz — Modern Game Server Management" },
      {
        name: "description",
        content:
          "Oryz is an open-source game server control panel: real-time consoles, granular roles, audit trails and a clean daemon API.",
      },
      { property: "og:title", content: "Oryz — Modern Game Server Management" },
      {
        property: "og:description",
        content:
          "Open-source game server control panel with real-time consoles, RBAC, audit logging and a clean daemon API.",
      },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  {
    icon: Terminal,
    title: "Live console",
    body: "Streaming stdout, command input and power controls with sub-second feedback.",
  },
  {
    icon: Activity,
    title: "Real resource metrics",
    body: "CPU, memory, disk and network sampled straight from the container runtime.",
  },
  {
    icon: ShieldCheck,
    title: "Granular RBAC",
    body: "Roles and permissions enforced in the database, not just the interface.",
  },
  {
    icon: FileClock,
    title: "Append-only audit log",
    body: "Every privileged action recorded with actor, resource and timestamp.",
  },
  {
    icon: Server,
    title: "Node fleet management",
    body: "Register daemon hosts, track capacity and schedule maintenance windows.",
  },
  {
    icon: Zap,
    title: "Pluggable daemon API",
    body: "One typed client contract — swap the mock adapter for real nodes with no UI change.",
  },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-6">
        <OryzMark className="size-8" />

        <span className="font-semibold tracking-tight">Oryz</span>
        <div className="ml-auto flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/auth">Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/dashboard">Open panel</Link>
          </Button>
        </div>
      </header>

      <section className="relative overflow-hidden px-6 py-24">
        <div className="pointer-events-none absolute inset-0 opacity-80 [background:radial-gradient(70rem_44rem_at_50%_-20%,color-mix(in_oklab,var(--primary)_20%,transparent),transparent)]" />
        <div className="relative mx-auto max-w-3xl text-center">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-muted/50 px-3 py-1 text-xs text-muted-foreground">
            Open source · self-hostable
          </p>
          <h1 className="text-balance text-5xl font-semibold tracking-tight sm:text-6xl">
            Game server management, rebuilt for the modern stack
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-balance text-lg text-muted-foreground">
            Deploy, monitor and operate your fleet from a single panel — with real-time consoles,
            role-based access control and a fully typed daemon contract.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/auth">Get started</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-28">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="panel rounded-xl p-5">
              <div className="mb-3 grid size-9 place-items-center rounded-lg bg-muted text-muted-foreground">
                <feature.icon className="size-4" />
              </div>
              <h2 className="text-sm font-medium">{feature.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{feature.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border px-6 py-8">
        <p className="mx-auto max-w-6xl text-xs text-muted-foreground">
          Oryz · an open-source game server control panel.
        </p>
      </footer>
    </div>
  );
}
