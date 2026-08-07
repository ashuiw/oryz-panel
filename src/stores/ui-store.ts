import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeMode = "light" | "dark" | "system";
export type Density = "comfortable" | "compact";

interface UiState {
  theme: ThemeMode;
  density: Density;
  sidebarCollapsed: boolean;
  commandPaletteOpen: boolean;
  shortcutsOpen: boolean;
  setTheme: (theme: ThemeMode) => void;
  setDensity: (density: Density) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  toggleCommandPalette: () => void;
  setShortcutsOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      theme: "dark",
      density: "comfortable",
      sidebarCollapsed: false,
      commandPaletteOpen: false,
      shortcutsOpen: false,
      setTheme: (theme) => set({ theme }),
      setDensity: (density) => set({ density }),
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
      toggleCommandPalette: () => set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen })),
      setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
    }),
    {
      name: "oryz-ui",
      partialize: (state) => ({
        theme: state.theme,
        density: state.density,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
    },
  ),
);
