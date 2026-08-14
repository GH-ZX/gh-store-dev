import type { ThemeMode } from "@/lib/settings/theme-settings";

export const THEME_STORAGE_KEY = "gh-store-theme";

export type ThemePreference = "dark" | "light";

/**
 * Inline script that applies the stored theme before first paint.
 *
 * It must stay dependency-free and synchronous: anything async would let the
 * default dark theme paint first and flash when a light-theme visitor loads a
 * page. Wrapped in try/catch because storage access throws in some privacy
 * modes.
 */
const SYSTEM_PREFERENCE = `window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"`;

/**
 * The script, with the owner's default applied.
 *
 * Only ever consulted when the visitor has no stored preference of their own:
 * an owner choosing "dark" is picking what the store looks like to someone
 * arriving for the first time, not overriding a returning visitor's switch.
 *
 * `mode` comes from a fixed set, so nothing user-written reaches this string.
 */
export function themeInitScript(mode: ThemeMode = "system"): string {
  const fallback = mode === "system" ? SYSTEM_PREFERENCE : `"${mode}"`;

  return `try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(!t){t=${fallback}}if(t==="light"){document.documentElement.dataset.theme="light"}}catch(e){}`;
}
