import type { CSSProperties } from "react";
import {
  AA_NORMAL_TEXT,
  contrastRatio,
  darkAccentPaint,
  lightAccentPaint,
  safeColour,
  type ThemeSettings,
} from "@/lib/settings/theme-settings";

const DARK_TEXT_SURFACE = "#222632";

/** Keep the saved hue while making small accent text readable on every dark surface. */
export function readableDarkAccent(accent: string): string {
  const safe = safeColour(accent);
  if (!safe) return "#7576ff";
  if ((contrastRatio(safe, DARK_TEXT_SURFACE) ?? 0) >= AA_NORMAL_TEXT)
    return safe;
  const hex =
    safe.length === 4
      ? safe
          .slice(1)
          .split("")
          .map((digit) => digit + digit)
          .join("")
      : safe.slice(1);
  const channels = [0, 2, 4].map((offset) =>
    Number.parseInt(hex.slice(offset, offset + 2), 16),
  );
  for (let percent = 1; percent <= 100; percent++) {
    const candidate =
      "#" +
      channels
        .map((value) =>
          Math.round(value + ((255 - value) * percent) / 100)
            .toString(16)
            .padStart(2, "0"),
        )
        .join("");
    if ((contrastRatio(candidate, DARK_TEXT_SURFACE) ?? 0) >= AA_NORMAL_TEXT)
      return candidate;
  }
  return "#ffffff";
}

/** Customer-only overrides; never write the owner's saved settings. */
export function getStorefrontThemeStyle(theme?: ThemeSettings): CSSProperties {
  const accent = safeColour(theme?.accent);
  if (!accent) return {};
  const dark = darkAccentPaint(accent);
  const light = lightAccentPaint(accent);
  return {
    "--sf-dark-accent": readableDarkAccent(accent),
    "--sf-dark-button": dark.accent,
    "--sf-dark-button-ink": dark.ink,
    "--sf-light-accent": light.accent,
    "--sf-light-button": light.accent,
    "--sf-light-button-ink": light.ink,
  } as CSSProperties;
}
