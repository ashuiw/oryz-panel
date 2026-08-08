import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Terminal } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  getDaemonClient,
  type ConsoleMessage,
  type ContainerState,
  type ResourceUsage,
} from "@/daemon";
import { formatBytes, formatPercent, formatUptime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/servers/$serverId/")({
  component: ConsolePage,
});

function ConsolePage() {
  const { serverId } = Route.useParams();
  const daemon = getDaemonClient();

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

  return (
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
