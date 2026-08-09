import { OryzMark } from "@/components/brand/oryz-mark";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  Boxes,
  FileClock,
  Gauge,
  KeyRound,
  LayoutGrid,
  MapPin,
  Network,
  Server,
  Settings,
  ShieldCheck,
  Users,
  Webhook,
} from "lucide-react";


import { cn } from "@/lib/utils";
import { useAccess } from "@/hooks/use-access";
import { PERMISSIONS, type PermissionKey } from "@/lib/permissions";
import { useUiStore } from "@/stores/ui-store";

interface NavItem {
  label: string;
  to: string;
  icon: typeof Server;
  permission?: PermissionKey;
  exact?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
  staffOnly?: boolean;
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { label: "Overview", to: "/dashboard", icon: Gauge, exact: true },
      { label: "Servers", to: "/servers", icon: Server },
      { label: "Activity", to: "/account/activity", icon: Activity },
    ],
  },
  {
    label: "Account",
    items: [
      { label: "Profile", to: "/account", icon: Users, exact: true },
      { label: "API keys", to: "/account/api", icon: KeyRound },
      { label: "Security", to: "/account/security", icon: ShieldCheck },
    ],
  },
  {
    label: "Administration",
    staffOnly: true,
    items: [
      { label: "Admin home", to: "/admin", icon: LayoutGrid, exact: true },
      {
        label: "Servers",
        to: "/admin/servers",
        icon: Server,
        permission: PERMISSIONS.serverCreate,
      },
      { label: "Nodes", to: "/admin/nodes", icon: Network, permission: PERMISSIONS.nodeView },
      { label: "Locations", to: "/admin/locations", icon: MapPin, permission: PERMISSIONS.locationManage },
      { label: "Nests & eggs", to: "/admin/nests", icon: Boxes, permission: PERMISSIONS.eggManage },
      { label: "Users", to: "/admin/users", icon: Users, permission: PERMISSIONS.userView },
      { label: "Webhooks", to: "/admin/webhooks", icon: Webhook, permission: PERMISSIONS.webhookManage },
      {
        label: "Audit log",
        to: "/admin/audit",
        icon: FileClock,
        permission: PERMISSIONS.auditView,
      },
      {
        label: "Settings",
        to: "/admin/settings",
        icon: Settings,
        permission: PERMISSIONS.settingsManage,
      },

    ],
  },
];

export function AppSidebar() {
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const { isStaff, can } = useAccess();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  const isActive = (item: NavItem) =>
    item.exact ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`);

  return (
    <aside
      className={cn(
        "hidden shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 md:flex",
        collapsed ? "w-[68px]" : "w-64",
      )}
    >
      <div className="flex h-14 items-center gap-2.5 px-4">
        <OryzMark className="size-8" />

        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight">Oryz</p>
            <p className="truncate text-[11px] text-muted-foreground">Game server platform</p>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
        {NAV_GROUPS.filter((group) => !group.staffOnly || isStaff).map((group) => {
          const items = group.items.filter((item) => !item.permission || can(item.permission));
          if (items.length === 0) return null;

          return (
            <div key={group.label}>
              {!collapsed && (
                <p className="px-2 pb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                  {group.label}
                </p>
              )}
              <ul className="space-y-0.5">
                {items.map((item) => (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        "focus-ring flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                        isActive(item)
                          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                          : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                        collapsed && "justify-center px-0",
                      )}
                    >
                      <item.icon className="size-4 shrink-0" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
