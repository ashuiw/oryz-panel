import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut, Menu, Moon, Search, Sun, User } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAccess } from "@/hooks/use-access";
import { initialsOf } from "@/lib/format";
import { ROLE_LABELS } from "@/lib/permissions";
import { supabase } from "@/integrations/supabase/client";
import { useUiStore } from "@/stores/ui-store";

export function AppTopbar() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const setCommandPaletteOpen = useUiStore((state) => state.setCommandPaletteOpen);
  const theme = useUiStore((state) => state.theme);
  const setTheme = useUiStore((state) => state.setTheme);
  const { profile, user, role } = useAccess();

  const name = profile?.display_name ?? profile?.username ?? user?.email ?? "Account";

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    void navigate({ to: "/auth", replace: true });
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-xl">
      <Button variant="ghost" size="icon" className="size-8" onClick={toggleSidebar}>
        <Menu className="size-4" />
        <span className="sr-only">Toggle navigation</span>
      </Button>

      <button
        type="button"
        onClick={() => setCommandPaletteOpen(true)}
        className="focus-ring flex h-8 w-full max-w-md items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted"
      >
        <Search className="size-3.5" />
        <span>Search or jump to…</span>
        <kbd className="ml-auto rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px]">
          ⌘K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          <span className="sr-only">Toggle theme</span>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 gap-2 px-1.5">
              <Avatar className="size-6">
                <AvatarFallback className="text-[10px]">{initialsOf(name)}</AvatarFallback>
              </Avatar>
              <span className="hidden max-w-32 truncate text-sm md:inline">{name}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="space-y-0.5">
              <p className="truncate text-sm font-medium">{name}</p>
              <p className="truncate text-xs font-normal text-muted-foreground">
                {ROLE_LABELS[role]}
              </p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/account">
                <User className="size-4" /> Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void signOut()}>
              <LogOut className="size-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
