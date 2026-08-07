import { createFileRoute, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Power, RotateCw, Square, Terminal } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { getDaemonClient, type ConsoleMessage, type ContainerState, type PowerAction, type ResourceUsage } from "@/daemon";
import { formatBytes, formatPercent, formatUptime } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";

export const Route = createFileRoute("/_authenticated/servers/$serverId")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.serverId} — Oryz Panel` },
      { name: "description", content: "Console, resource usage and power controls for this server." },
    ],
  }),
  component: ServerDetailPage,
});

const STATE_TONE: Record<ContainerState, string> = {
  running: "bg-success/15 text-success border-success/30",
  starting: "bg-info/15 text-info border-info/30",
  stopping: "bg-warning/15 text-warning border-warning/30",
  offline: "bg-muted text-muted-foreground border-border",
  installing: "bg-info/15 text-info border-info/30",
  error: "bg-destructive/15 text-destructive border-destructive/30",
};

function ServerDetailPage() {
  const { serverId } = Route.useParams();
  const daemon = getDaemonClient();

  const serverQuery = useQuery({
    queryKey: queryKeys.servers.detail(serverId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("servers")
        .select("id, identifier, name, description, status, suspended, memory_mb, disk_mb, cpu_percent")
        .eq("identifier", serverId)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw notFound();
      return data;
    },
  });

  const [lines, setLines] = useState<string[]>([]);
  const [state, setState] = useState<ContainerState>("offline");
  const [stats, setStats] = useState<ResourceUsage | null>(null);
  const [command, setCommand] = useState("");
  const streamRef = useRef<{ send: (value: string) => void; close: () => void } | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);

  const onMessage = useCallback((message: ConsoleMessage) => {
    if (message.type === "output" && message.line) {
      setLines((current) => [...current.slice(-400), message.line!]);
    }
    if (message.type === "status" && message.state) setState(message.state);
    if (message.type === "stats" && message.stats) setStats(message.stats);
  }, []);

  useEffect(() => {
    let active = true;
    void daemon.subscribeConsole(serverId, onMessage).then((subscription) => {
      if (!active) {
        subscription.close();
        return;
      }
      streamRef.current = subscription;
    });
    void daemon.getResourceUsage(serverId).then(setStats);
    return () => {
      active = false;
      streamRef.current?.close();
      streamRef.current = null;
    };
  }, [daemon, serverId, onMessage]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [lines]);

  async function power(action: PowerAction) {
    try {
      await daemon.sendPower(serverId, action);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Power action failed");
    }
  }

  function submitCommand(event: React.FormEvent) {
    event.preventDefault();
    const value = command.trim();
    if (!value) return;
    if (state !== "running") {
      toast.error("The server must be running to accept commands");
      return;
    }
    streamRef.current?.send(value);
    setCommand("");
  }

  if (serverQuery.isLoading) return <Skeleton className="h-96 w-full" />;

  const server = serverQuery.data;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={server?.name ?? serverId}
        description={server?.description ?? `Identifier ${serverId}`}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={STATE_TONE[state]}>
              {state}
            </Badge>
            <Button size="sm" variant="outline" onClick={() => void power("start")} disabled={state === "running"}>
              <Play className="size-3.5" /> Start
            </Button>
            <Button size="sm" variant="outline" onClick={() => void power("restart")}>
              <RotateCw className="size-3.5" /> Restart
            </Button>
            <Button size="sm" variant="outline" onClick={() => void power("stop")} disabled={state === "offline"}>
              <Square className="size-3.5" /> Stop
            </Button>
            <Button size="sm" variant="destructive" onClick={() => void power("kill")} disabled={state === "offline"}>
              <Power className="size-3.5" /> Kill
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1.7fr_1fr]">
        <Card className="overflow-hidden">
          <CardHeader className="flex-row items-center gap-2 space-y-0 border-b border-border py-3">
            <Terminal className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Console</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div
              ref={logRef}
              className="h-[420px] overflow-y-auto bg-[color-mix(in_oklab,var(--background)_92%,black)] p-4 font-mono text-[12.5px] leading-relaxed"
            >
              {lines.length === 0 ? (
                <p className="text-muted-foreground">Waiting for daemon output…</p>
              ) : (
                lines.map((line, index) => (
                  <p key={index} className="whitespace-pre-wrap break-words text-foreground/90">
                    {line}
                  </p>
                ))
              )}
            </div>
            <form onSubmit={submitCommand} className="flex gap-2 border-t border-border p-3">
              <Input
                value={command}
                maxLength={512}
                onChange={(event) => setCommand(event.target.value)}
                placeholder="Type a command and press enter"
                className="font-mono text-sm"
              />
              <Button type="submit" size="sm">
                Send
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium">Resources</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <Meter
              label="CPU"
              value={stats ? formatPercent(stats.cpuPercent, 1) : "—"}
              percent={stats ? (stats.cpuPercent / stats.cpuLimitPercent) * 100 : 0}
            />
            <Meter
              label="Memory"
              value={stats ? `${formatBytes(stats.memoryBytes)} / ${formatBytes(stats.memoryLimitBytes)}` : "—"}
              percent={stats ? (stats.memoryBytes / stats.memoryLimitBytes) * 100 : 0}
            />
            <Meter
              label="Disk"
              value={stats ? `${formatBytes(stats.diskBytes)} / ${formatBytes(stats.diskLimitBytes)}` : "—"}
              percent={stats ? (stats.diskBytes / stats.diskLimitBytes) * 100 : 0}
            />
            <dl className="grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Uptime</dt>
                <dd className="tnum">{stats ? formatUptime(stats.uptimeSeconds) : "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Players</dt>
                <dd className="tnum">
                  {stats?.players ? `${stats.players.online} / ${stats.players.max}` : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Network in</dt>
                <dd className="tnum">{stats ? formatBytes(stats.networkRxBytes) : "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Network out</dt>
                <dd className="tnum">{stats ? formatBytes(stats.networkTxBytes) : "—"}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Meter({ label, value, percent }: { label: string; value: string; percent: number }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="tnum text-xs">{value}</span>
      </div>
      <Progress value={Math.max(0, Math.min(100, percent))} className="h-1.5" />
    </div>
  );
}
