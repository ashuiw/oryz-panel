#!/usr/bin/env node
import { createServer } from "node:http";
import { execFile, spawn } from "node:child_process";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, resolve, sep } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const configPath = process.argv[process.argv.indexOf("--config") + 1] || "/etc/oryz-wings/config.yml";
const raw = await readFile(configPath, "utf8");
const value = (key, fallback = "") => raw.match(new RegExp(`^\\s*${key}:\\s*(.+?)\\s*$`, "m"))?.[1]?.replace(/^['"]|['"]$/g, "") ?? fallback;
const port = Number(value("port", "8080"));
const token = value("token");
const dataDir = value("data_dir", "/var/lib/oryz-wings");
const volumeDir = value("volume_dir", `${dataDir}/volumes`);
const backupDir = value("backup_dir", `${dataDir}/backups`);
await Promise.all([mkdir(volumeDir, { recursive: true }), mkdir(backupDir, { recursive: true })]);

const json = (response, status, payload) => {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
};
const docker = async (...args) => (await exec("docker", args, { maxBuffer: 32 * 1024 * 1024 })).stdout.trim();
const containerName = (id) => `oryz-${id.replace(/[^a-zA-Z0-9_.-]/g, "-")}`;
const serverRoot = (id) => resolve(volumeDir, id);
const safeFile = (id, requested) => {
  const root = serverRoot(id);
  const target = resolve(root, `.${requested.startsWith("/") ? requested : `/${requested}`}`);
  if (target !== root && !target.startsWith(`${root}${sep}`)) throw new Error("Path leaves the server volume");
  return target;
};
const readBody = async (request) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
};
const exists = async (name) => {
  try { await docker("inspect", name); return true; } catch { return false; }
};
const inspect = async (name) => JSON.parse(await docker("inspect", name))[0];
const fileEntry = async (root, name) => {
  const item = resolve(root, name);
  const info = await stat(item);
  return {
    name,
    path: item.slice(root.length).replaceAll("\\", "/") || "/",
    isDirectory: info.isDirectory(),
    isSymlink: info.isSymbolicLink(),
    sizeBytes: info.size,
    mode: (info.mode & 0o777).toString(8),
    mimeType: info.isDirectory() ? null : "text/plain",
    modifiedAt: info.mtime.toISOString(),
  };
};

async function installServer(id, spec) {
  if (!spec?.dockerImage || !spec?.startupCommand) throw new Error("Missing server installation manifest");
  const name = containerName(id);
  const root = serverRoot(id);
  await mkdir(root, { recursive: true });
  if (await exists(name)) await docker("rm", "-f", name);
  await docker("pull", spec.dockerImage);
  const args = ["create", "-i", "--name", name, "--restart", "unless-stopped", "--memory", `${spec.memoryMb}m`, "--cpus", String(Math.max(spec.cpuPercent / 100, 0.01)), "-v", `${root}:/home/container`, "-w", "/home/container"];
  for (const allocation of spec.allocations ?? []) args.push("-p", `${allocation.ip}:${allocation.port}:${allocation.port}`);
  for (const [key, val] of Object.entries(spec.variables ?? {})) args.push("-e", `${key}=${val}`);
  args.push(spec.dockerImage, "/bin/sh", "-lc", spec.startupCommand);
  await docker(...args);
  await docker("start", name);
}

async function route(request, response) {
  if (request.headers.authorization !== `Bearer ${token}`) return json(response, 401, { message: "Unauthorized" });
  const url = new URL(request.url ?? "/", "http://node.local");
  if (url.pathname === "/api/system/health") {
    const containers = Number((await docker("ps", "-q")).split("\n").filter(Boolean).length);
    return json(response, 200, { nodeId: value("uuid"), reachable: true, version: "0.2.0", dockerVersion: await docker("version", "--format", "{{.Server.Version}}"), kernel: process.version, os: process.platform, cpuCores: 0, cpuPercent: 0, memoryUsedMb: 0, memoryTotalMb: Number(value("memory_mb", "0")), diskUsedMb: 0, diskTotalMb: Number(value("disk_mb", "0")), containers: { running: containers, total: containers }, latencyMs: 0, lastHeartbeatAt: new Date().toISOString() });
  }
  const match = url.pathname.match(/^\/api\/servers\/([^/]+)(\/.*)?$/);
  if (!match) return json(response, 404, { message: "Not found" });
  const id = decodeURIComponent(match[1]);
  const action = match[2] ?? "";
  const name = containerName(id);
  const body = request.method === "GET" || request.method === "DELETE" ? {} : await readBody(request);

  if (action === "" && request.method === "DELETE") {
    if (await exists(name)) await docker("rm", "-f", name);
    await rm(serverRoot(id), { recursive: true, force: true });
    return json(response, 204, null);
  }

  if (action === "/install" || action === "/reinstall") {
    if (action === "/reinstall") await rm(serverRoot(id), { recursive: true, force: true });
    await installServer(id, body);
    return json(response, 204, null);
  }
  if (action === "/power") {
    const commands = { start: ["start", name], stop: ["stop", name], restart: ["restart", name], kill: ["kill", name] };
    const command = commands[body.action];
    if (!command) throw new Error("Invalid power action");
    await docker(...command);
    return json(response, 204, null);
  }
  if (action === "/command") {
    const child = spawn("docker", ["attach", "--no-stdin=false", name], { stdio: ["pipe", "ignore", "ignore"] });
    child.stdin.end(`${body.command}\n`);
    return json(response, 204, null);
  }
  if (action === "/resources") {
    if (!(await exists(name))) return json(response, 404, { message: "Container is not installed" });
    const info = await inspect(name);
    const stats = JSON.parse(await docker("stats", "--no-stream", "--format", "{{json .}}", name));
    const number = (text) => Number(String(text).replace(/[^0-9.]/g, "")) || 0;
    const state = info.State.Running ? "running" : info.State.Status === "created" ? "offline" : info.State.Status;
    return json(response, 200, { serverId: id, state, cpuPercent: number(stats.CPUPerc), cpuLimitPercent: 100, memoryBytes: number(stats.MemUsage) * 1024 * 1024, memoryLimitBytes: Number(info.HostConfig.Memory || 0), diskBytes: 0, diskLimitBytes: 0, networkRxBytes: 0, networkTxBytes: 0, uptimeSeconds: info.State.StartedAt ? Math.max(0, Math.floor((Date.now() - Date.parse(info.State.StartedAt)) / 1000)) : 0, players: null, sampledAt: new Date().toISOString() });
  }
  if (action === "/console") {
    const logs = await exec("docker", ["logs", "--tail", "500", name], { maxBuffer: 16 * 1024 * 1024 }).catch(() => ({ stdout: "", stderr: "" }));
    const lines = `${logs.stdout}${logs.stderr}`.split("\n").filter(Boolean);
    const cursor = Math.max(Number(url.searchParams.get("cursor") ?? 0), 0);
    return json(response, 200, { cursor: lines.length, messages: lines.slice(cursor).map((line) => ({ type: "output", line, timestamp: new Date().toISOString() })) });
  }
  if (action === "/files/list") {
    const target = safeFile(id, url.searchParams.get("path") ?? "/");
    await mkdir(target, { recursive: true });
    const entries = await readdir(target);
    const details = await Promise.all(
      entries.map((entry) =>
        fileEntry(serverRoot(id), resolve(target, entry).slice(serverRoot(id).length + 1)),
      ),
    );
    return json(response, 200, details);
  }
  if (action === "/files/contents") return json(response, 200, await readFile(safeFile(id, url.searchParams.get("path") ?? "/"), "utf8"));
  if (action === "/files/write") { const target = safeFile(id, body.path); await mkdir(dirname(target), { recursive: true }); await writeFile(target, body.contents, "utf8"); return json(response, 204, null); }
  if (action === "/files/delete") { for (const path of body.paths ?? []) await rm(safeFile(id, path), { recursive: true, force: true }); return json(response, 204, null); }
  if (action === "/files/rename") { await rename(safeFile(id, body.from), safeFile(id, body.to)); return json(response, 204, null); }
  if (action === "/files/create-directory") { await mkdir(safeFile(id, body.path), { recursive: true }); return json(response, 204, null); }
  if (action === "/backup") {
    const backupId = crypto.randomUUID();
    const output = resolve(backupDir, `${id}-${backupId}.tar.gz`);
    await exec("tar", ["-czf", output, "-C", serverRoot(id), "."]);
    const info = await stat(output);
    return json(response, 200, { id: backupId, name: body.name, bytes: info.size, checksum: null, progress: 100, status: "completed", createdAt: new Date().toISOString(), completedAt: new Date().toISOString() });
  }
  return json(response, 404, { message: "Unsupported node operation" });
}

createServer((request, response) => void route(request, response).catch((error) => json(response, 500, { message: error instanceof Error ? error.message : "Node operation failed" }))).listen(port, "0.0.0.0", () => console.log(`Oryz Wings listening on :${port}`));