/**
 * Central TanStack Query key factory.
 * Every module registers its keys here so invalidation stays predictable.
 */
export const queryKeys = {
  session: ["session"] as const,
  profile: (userId: string) => ["profile", userId] as const,
  access: (userId: string) => ["access", userId] as const,

  servers: {
    all: ["servers"] as const,
    list: (filters?: Record<string, unknown>) => ["servers", "list", filters ?? {}] as const,
    detail: (id: string) => ["servers", "detail", id] as const,
    stats: (id: string) => ["servers", "stats", id] as const,
    files: (id: string, path: string) => ["servers", "files", id, path] as const,
    backups: (id: string) => ["servers", "backups", id] as const,
    schedules: (id: string) => ["servers", "schedules", id] as const,
    databases: (id: string) => ["servers", "databases", id] as const,
    allocations: (id: string) => ["servers", "allocations", id] as const,
  },

  nodes: {
    all: ["nodes"] as const,
    list: () => ["nodes", "list"] as const,
    detail: (id: string) => ["nodes", "detail", id] as const,
    metrics: (id: string) => ["nodes", "metrics", id] as const,
  },

  locations: ["locations"] as const,
  nests: ["nests"] as const,
  eggs: (nestId?: string) => ["eggs", nestId ?? "all"] as const,
  allocations: ["allocations"] as const,

  users: {
    all: ["users"] as const,
    list: () => ["users", "list"] as const,
    detail: (id: string) => ["users", "detail", id] as const,
  },

  apiKeys: ["api-keys"] as const,
  sessions: ["user-sessions"] as const,
  notifications: ["notifications"] as const,
  webhooks: ["webhooks"] as const,
  auditLogs: (filters?: Record<string, unknown>) => ["audit-logs", filters ?? {}] as const,
  settings: ["settings"] as const,
  dashboard: ["dashboard", "overview"] as const,
} as const;
