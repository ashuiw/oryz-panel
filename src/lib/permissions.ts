/**
 * Permission + role model.
 *
 * Roles live in the `user_roles` table and permissions in `role_permissions`.
 * Never trust these client-side values for authorisation — they drive UI only.
 * The database enforces the same model through `has_role`, `is_staff` and
 * `has_permission` security-definer functions used by every RLS policy.
 */

export const APP_ROLES = [
  "owner",
  "super_admin",
  "admin",
  "moderator",
  "support",
  "user",
  "guest",
] as const;

export type AppRole = (typeof APP_ROLES)[number];

export const ROLE_LABELS: Record<AppRole, string> = {
  owner: "Owner",
  super_admin: "Super administrator",
  admin: "Administrator",
  moderator: "Moderator",
  support: "Support",
  user: "User",
  guest: "Guest",
};

/** Ordered most privileged first. Used for badge colouring and sorting. */
export const ROLE_RANK: Record<AppRole, number> = {
  owner: 0,
  super_admin: 1,
  admin: 2,
  moderator: 3,
  support: 4,
  user: 5,
  guest: 6,
};

export const STAFF_ROLES: AppRole[] = ["owner", "super_admin", "admin"];

export const PERMISSIONS = {
  serverView: "server.view",
  serverCreate: "server.create",
  serverUpdate: "server.update",
  serverDelete: "server.delete",
  serverPower: "server.power",
  serverConsole: "server.console",
  serverFiles: "server.files",
  serverBackups: "server.backups",
  serverSchedules: "server.schedules",
  serverDatabases: "server.databases",
  serverNetwork: "server.network",
  nodeView: "node.view",
  nodeManage: "node.manage",
  locationManage: "location.manage",
  allocationManage: "allocation.manage",
  eggManage: "egg.manage",
  userView: "user.view",
  userManage: "user.manage",
  roleManage: "role.manage",
  auditView: "audit.view",
  settingsManage: "settings.manage",
  webhookManage: "webhook.manage",
  apiKeyManage: "apikey.manage",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export function isStaffRole(roles: AppRole[]): boolean {
  return roles.some((role) => STAFF_ROLES.includes(role));
}

export function highestRole(roles: AppRole[]): AppRole {
  if (roles.length === 0) return "guest";
  return [...roles].sort((a, b) => ROLE_RANK[a] - ROLE_RANK[b])[0]!;
}
