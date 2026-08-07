import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import {
  Boxes,
  FileClock,
  Gauge,
  KeyRound,
  Moon,
  Network,
  Server,
  Settings,
  ShieldCheck,
  Sun,
  Users,
} from "lucide-react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useAccess } from "@/hooks/use-access";
import { useUiStore } from "@/stores/ui-store";

export function CommandPalette() {
  const navigate = useNavigate();
  const open = useUiStore((state) => state.commandPaletteOpen);
  const setOpen = useUiStore((state) => state.setCommandPaletteOpen);
  const toggle = useUiStore((state) => state.toggleCommandPalette);
  const theme = useUiStore((state) => state.theme);
  const setTheme = useUiStore((state) => state.setTheme);
  const { isStaff } = useAccess();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        toggle();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [toggle]);

  const go = (to: string) => {
    setOpen(false);
    void navigate({ to });
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search servers, pages and actions…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigate">
          <CommandItem onSelect={() => go("/dashboard")}>
            <Gauge className="size-4" /> Overview
          </CommandItem>
          <CommandItem onSelect={() => go("/servers")}>
            <Server className="size-4" /> Servers
          </CommandItem>
          <CommandItem onSelect={() => go("/account")}>
            <Users className="size-4" /> Profile
          </CommandItem>
          <CommandItem onSelect={() => go("/account/api")}>
            <KeyRound className="size-4" /> API keys
          </CommandItem>
          <CommandItem onSelect={() => go("/account/security")}>
            <ShieldCheck className="size-4" /> Security
          </CommandItem>
        </CommandGroup>

        {isStaff && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Administration">
              <CommandItem onSelect={() => go("/admin/nodes")}>
                <Network className="size-4" /> Nodes
              </CommandItem>
              <CommandItem onSelect={() => go("/admin/nests")}>
                <Boxes className="size-4" /> Nests & eggs
              </CommandItem>
              <CommandItem onSelect={() => go("/admin/users")}>
                <Users className="size-4" /> Users
              </CommandItem>
              <CommandItem onSelect={() => go("/admin/audit")}>
                <FileClock className="size-4" /> Audit log
              </CommandItem>
              <CommandItem onSelect={() => go("/admin/settings")}>
                <Settings className="size-4" /> Settings
              </CommandItem>
            </CommandGroup>
          </>
        )}

        <CommandSeparator />
        <CommandGroup heading="Preferences">
          <CommandItem
            onSelect={() => {
              setTheme(theme === "dark" ? "light" : "dark");
              setOpen(false);
            }}
          >
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            Switch to {theme === "dark" ? "light" : "dark"} theme
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
