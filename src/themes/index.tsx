import * as React from "react";
import type { Theme } from "./schema";
import { themePresets } from "./presets";
import { themeSchema } from "./schema";

const ThemeContext = React.createContext<Theme>(themePresets.cinematic!);

export function useTheme(): Theme {
  return React.useContext(ThemeContext);
}

export function ThemeProvider({
  theme,
  children,
}: {
  theme: Theme;
  children: React.ReactNode;
}) {
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

/**
 * Resolve a theme from a preset name, inline JSON string, Theme object,
 * or {base, ...overrides} object (start from a preset, override specific keys).
 * Falls back to "cinematic" if unresolvable.
 */
export function resolveTheme(input?: string | Theme | Record<string, unknown>): Theme {
  if (!input) return themePresets.cinematic!;

  // Preset name
  if (typeof input === "string") {
    if (themePresets[input]) return themePresets[input]!;
    // Try parsing as JSON
    try {
      const parsed = JSON.parse(input);
      return themeSchema.parse(parsed);
    } catch {
      return themePresets.cinematic!;
    }
  }

  // { base: "neon", colors: { primary: "#ff0000" }, ...overrides }
  if ("base" in input && typeof input.base === "string" && themePresets[input.base]) {
    const base = themePresets[input.base]!;
    const { base: _base, ...overrides } = input;
    const merged = { ...base, ...overrides };
    // Deep-merge colors, fonts, timing, effects if overrides provide partials
    for (const section of ["colors", "fonts", "timing", "effects"] as const) {
      if (overrides[section] && typeof overrides[section] === "object") {
        merged[section] = { ...base[section], ...(overrides[section] as any) };
      }
    }
    return merged as Theme;
  }

  // Theme object or partial
  try {
    return themeSchema.parse(input);
  } catch {
    return themePresets.cinematic!;
  }
}

export { ThemeContext, themePresets };
export { themeSchema, type Theme, type SpringConfig } from "./schema";
