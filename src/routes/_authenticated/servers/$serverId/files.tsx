import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ChevronRight, File, Folder, RefreshCw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { getDaemonClient } from "@/daemon";
import { formatBytes, formatRelative } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";

export const Route = createFileRoute("/_authenticated/servers/$serverId/files")({
  component: FilesPage,
});

function FilesPage() {
  const { serverId } = Route.useParams();
  const daemon = getDaemonClient();
  const queryClient = useQueryClient();

  const [path, setPath] = useState("/");
  const [editing, setEditing] = useState<{ path: string; contents: string } | null>(null);
  const [newFolder, setNewFolder] = useState("");

  const listing = useQuery({
    queryKey: queryKeys.servers.files(serverId, path),
    queryFn: () => daemon.listFiles(serverId, path),
  });

  const open = useMutation({
    mutationFn: async (filePath: string) => ({
      path: filePath,
      contents: await daemon.readFile(serverId, filePath),
    }),
    onSuccess: setEditing,
    onError: (error: Error) => toast.error(error.message),
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      await daemon.writeFile(serverId, editing.path, editing.contents);
    },
    onSuccess: () => toast.success("File saved to the node"),
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (target: string) => daemon.deleteFiles(serverId, [target]),
    onSuccess: () => {
      toast.success("Deleted");
      void queryClient.invalidateQueries({ queryKey: queryKeys.servers.files(serverId, path) });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const mkdir = useMutation({
    mutationFn: (name: string) => daemon.createDirectory(serverId, joinPath(path, name)),
    onSuccess: () => {
      setNewFolder("");
      toast.success("Folder created");
      void queryClient.invalidateQueries({ queryKey: queryKeys.servers.files(serverId, path) });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const segments = path.split("/").filter(Boolean);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <nav className="flex flex-1 flex-wrap items-center gap-1 text-sm">
          <button className="text-muted-foreground hover:text-foreground" onClick={() => setPath("/")}>
            container
          </button>
          {segments.map((segment, index) => (
            <span key={index} className="flex items-center gap-1">
              <ChevronRight className="size-3 text-muted-foreground" />
              <button
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setPath("/" + segments.slice(0, index + 1).join("/"))}
              >
                {segment}
              </button>
            </span>
          ))}
        </nav>
        <Input
          value={newFolder}
          onChange={(event) => setNewFolder(event.target.value)}
          placeholder="New folder name"
          maxLength={64}
          className="h-8 w-48"
        />
        <Button
          size="sm"
          variant="outline"
          disabled={!newFolder.trim() || mkdir.isPending}
          onClick={() => mkdir.mutate(newFolder.trim())}
        >
          Create folder
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void listing.refetch()}>
          <RefreshCw className="size-3.5" />
        </Button>
      </div>

      {listing.isLoading && <Skeleton className="h-64 w-full" />}

      {!listing.isLoading && (
        <Card>
          <CardContent className="divide-y divide-border p-0">
            {(listing.data ?? []).length === 0 && (
              <p className="p-8 text-center text-sm text-muted-foreground">This folder is empty.</p>
            )}
            {(listing.data ?? []).map((entry) => (
              <div key={entry.path} className="flex items-center gap-3 px-4 py-2.5">
                {entry.isDirectory ? (
                  <Folder className="size-4 text-primary" />
                ) : (
                  <File className="size-4 text-muted-foreground" />
                )}
                <button
                  className="min-w-0 flex-1 truncate text-left text-sm hover:underline"
                  onClick={() =>
                    entry.isDirectory ? setPath(entry.path) : open.mutate(entry.path)
                  }
                >
                  {entry.name}
                </button>
                <span className="tnum text-xs text-muted-foreground">
                  {entry.isDirectory ? "—" : formatBytes(entry.sizeBytes)}
                </span>
                <span className="hidden text-xs text-muted-foreground sm:block">
                  {formatRelative(entry.modifiedAt)}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  onClick={() => remove.mutate(entry.path)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {editing && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <p className="font-mono text-xs text-muted-foreground">{editing.path}</p>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                  Close
                </Button>
                <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
                  <Save className="size-3.5" /> Save
                </Button>
              </div>
            </div>
            <Textarea
              value={editing.contents}
              onChange={(event) => setEditing({ ...editing, contents: event.target.value })}
              rows={20}
              className="font-mono text-xs"
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function joinPath(base: string, name: string) {
  return `${base.replace(/\/$/, "")}/${name}`;
}
