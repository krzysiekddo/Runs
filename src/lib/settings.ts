// Per-device look & feel: colour scheme and accent colour, kept in localStorage.
import { useEffect, useState } from "react";

export type ThemeChoice = "system" | "light" | "dark";

export type Accent = { id: string; name: string; light: string; dark: string };

/** Each accent has a light-mode and a dark-mode shade with readable text on top. */
export const ACCENTS: Accent[] = [
  { id: "graphite", name: "Grafit", light: "#1c2430", dark: "#e9edf2" },
  { id: "blue", name: "Niebieski", light: "#2459c9", dark: "#7aa7ff" },
  { id: "teal", name: "Morski", light: "#0f6f66", dark: "#4fd1be" },
  { id: "green", name: "Zielony", light: "#2f7a32", dark: "#7fd67f" },
  { id: "orange", name: "Pomarańczowy", light: "#b4480c", dark: "#fb9a5b" },
  { id: "pink", name: "Różowy", light: "#b0245e", dark: "#f586b5" },
];

export type Settings = { theme: ThemeChoice; accent: string };

const KEY = "runs.settings";
const DEFAULTS: Settings = { theme: "system", accent: "graphite" };

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

function prefersDark(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
}

function apply(s: Settings) {
  const root = document.documentElement;
  if (s.theme === "system") delete root.dataset.theme;
  else root.dataset.theme = s.theme;

  const dark = s.theme === "dark" || (s.theme === "system" && prefersDark());
  const accent = ACCENTS.find((a) => a.id === s.accent) ?? ACCENTS[0];
  root.style.setProperty("--accent", dark ? accent.dark : accent.light);
  root.style.setProperty("--on-accent", dark ? "#12161c" : "#ffffff");

  // Keep the phone's status bar in step with the chosen theme.
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    if (s.theme === "system") meta.content = meta.media.includes("dark") ? "#151a21" : "#eef1f5";
    else meta.content = dark ? "#151a21" : "#eef1f5";
  }
}

/** Applies the saved look before React renders, so the login screen matches too. */
export function applyStoredSettings() {
  apply(load());
}

export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const [settings, setSettings] = useState<Settings>(load);

  useEffect(() => {
    apply(settings);
    if (settings.theme !== "system" || typeof matchMedia !== "function") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply(settings);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [settings]);

  const update = (patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // Private mode: the choice still applies for this visit.
      }
      return next;
    });
  };
  return [settings, update];
}
