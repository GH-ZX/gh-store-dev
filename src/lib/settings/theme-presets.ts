import type { ThemeSettings } from "@/lib/settings/theme-settings";

/**
 * Ready-made accent pairs.
 *
 * The theme editor asks for two colours and derives the rest, which is the right
 * amount of control and the wrong amount of help: picking two colours that agree
 * with each other is a design job, and an owner who wants a purple store should
 * not have to find out which purple carries white text.
 *
 * So these are pairs, not palettes. Each one sets exactly the two fields the
 * editor already has — pressing one fills the inputs and nothing is saved until
 * the owner presses save, so a preset is a starting point they can then edit
 * rather than a mode they are locked into.
 *
 * Every primary here passes 4.5:1 against the near-white the accent carries, and
 * a test in `tests/settings/theme-presets.test.ts` keeps it that way: a preset
 * that ships unreadable button labels is worse than no preset, because it looks
 * like the store's own recommendation.
 */

export type ThemePreset = {
  id: string;
  accent: string;
  accent2: string;
};

export const THEME_PRESETS: ThemePreset[] = [
  // The token file's own light-theme pair, so "back to the house colours" is one
  // press rather than a memory test.
  { id: "signal", accent: "#06607b", accent2: "#6a4fd8" },
  { id: "indigo", accent: "#4b45d8", accent2: "#0e7490" },
  { id: "emerald", accent: "#047857", accent2: "#0369a1" },
  { id: "violet", accent: "#7326c4", accent2: "#be1e63" },
  { id: "ember", accent: "#b03d09", accent2: "#a8410f" },
  { id: "crimson", accent: "#b91c3c", accent2: "#7326c4" },
  { id: "graphite", accent: "#3f4c5f", accent2: "#0e7490" },
];

/** The preset an owner is currently on, or null when the colours are their own. */
export function matchThemePreset(theme: ThemeSettings): ThemePreset | null {
  if (!theme.accent || !theme.accent2) {
    return null;
  }

  const accent = theme.accent.toLowerCase();
  const accent2 = theme.accent2.toLowerCase();

  return (
    THEME_PRESETS.find((preset) => preset.accent === accent && preset.accent2 === accent2) ?? null
  );
}
