import { useEffect } from "react";

import { useUiStore } from "@/stores/ui-store";

/** Applies the persisted theme + density to <html>. Client-only side effect. */
export function ThemeEffect() {
  const theme = useUiStore((state) => state.theme);
  const density = useUiStore((state) => state.density);

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && media.matches);
      root.classList.toggle("dark", dark);
      root.style.colorScheme = dark ? "dark" : "light";
    };

    apply();
    if (theme !== "system") return;
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset["density"] = density;
  }, [density]);

  return null;
}
