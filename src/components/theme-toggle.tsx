"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

export type Theme = "light" | "dark";
export const THEME_STORAGE_KEY = "folio-theme";

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}
const getSnapshot = (): Theme => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");
const getServerSnapshot = (): Theme => "light";

export function applyTheme(next: Theme) {
  const root = document.documentElement;
  // Briefly enable colour transitions so the switch feels smooth, not jarring.
  root.classList.add("theme-transition");
  root.dataset.theme = next;
  root.style.colorScheme = next;
  window.setTimeout(() => root.classList.remove("theme-transition"), 320);
  try { window.localStorage.setItem(THEME_STORAGE_KEY, next); } catch { /* storage may be unavailable */ }
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { theme, setTheme: applyTheme };
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      className="icon-button theme-toggle"
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      onClick={() => setTheme(next)}
    >
      {/* Both icons render; CSS shows the right one from <html data-theme>, so there is no hydration flicker. */}
      <Moon size={17} strokeWidth={1.8} className="theme-icon-moon" aria-hidden="true" />
      <Sun size={17} strokeWidth={1.8} className="theme-icon-sun" aria-hidden="true" />
    </button>
  );
}
