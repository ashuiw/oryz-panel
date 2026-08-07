/** Formatting helpers shared across dashboards, tables and charts. */

export function formatBytes(bytes: number, decimals = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : decimals)} ${units[i]}`;
}

export function formatMegabytes(mb: number): string {
  return formatBytes(mb * 1024 * 1024);
}

export function formatPercent(value: number, decimals = 0): string {
  return `${value.toFixed(decimals)}%`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value);
}

export function formatUptime(seconds: number): string {
  if (seconds <= 0) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function formatRelative(date: string | Date | null | undefined): string {
  if (!date) return "Never";
  const value = typeof date === "string" ? new Date(date) : date;
  const diff = Date.now() - value.getTime();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const table: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000000],
    ["month", 2592000000],
    ["day", 86400000],
    ["hour", 3600000],
    ["minute", 60000],
    ["second", 1000],
  ];
  for (const [unit, ms] of table) {
    if (abs >= ms || unit === "second") {
      return rtf.format(Math.round(-diff / ms), unit);
    }
  }
  return "just now";
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const value = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
    value,
  );
}

export function initialsOf(name?: string | null): string {
  if (!name) return "··";
  return name
    .split(/[\s_@.-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}
