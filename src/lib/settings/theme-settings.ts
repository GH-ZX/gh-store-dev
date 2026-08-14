import { z } from "zod";

/**
 * The parts of the design system an owner may change.
 *
 * Deliberately two colours and a default mode rather than a palette editor. The
 * token file defines around sixty variables that hold the light and dark themes
 * in balance with each other; exposing them all would let one save produce a
 * storefront nobody can read, and most of them exist to serve the two accents
 * anyway. So the accents are chosen and the rest is derived.
 *
 * **The hex check is a security boundary, not tidiness.** These values are
 * written into a `<style>` element, so a value that could contain `}` or `<`
 * would be able to close the declaration and write arbitrary CSS — or leave the
 * element entirely. Only `#` followed by three or six hex digits is accepted,
 * and anything else is discarded in favour of the built-in token.
 */

const HEX_COLOUR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export const THEME_MODES = ["system", "dark", "light"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

export type ThemeSettings = {
  /** Null means "use the token file's own value". */
  accent: string | null;
  accent2: string | null;
  /** What a first-time visitor gets before they have chosen for themselves. */
  defaultMode: ThemeMode;
};

export const DEFAULT_THEME_SETTINGS: ThemeSettings = {
  accent: null,
  accent2: null,
  defaultMode: "system",
};

const themeSchema = z.object({
  accent: z.string().nullish(),
  accent_2: z.string().nullish(),
  default_mode: z.string().nullish(),
});

/** A colour we are willing to write into a stylesheet, or null. */
export function safeColour(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim().toLowerCase();

  return HEX_COLOUR.test(trimmed) ? trimmed : null;
}

function readMode(value: unknown): ThemeMode {
  return typeof value === "string" && (THEME_MODES as readonly string[]).includes(value)
    ? (value as ThemeMode)
    : "system";
}

export function normalizeTheme(value: unknown): ThemeSettings {
  const parsed = themeSchema.safeParse(value ?? {});

  if (!parsed.success) {
    return DEFAULT_THEME_SETTINGS;
  }

  return {
    accent: safeColour(parsed.data.accent),
    accent2: safeColour(parsed.data.accent_2),
    defaultMode: readMode(parsed.data.default_mode),
  };
}

/**
 * The CSS that applies an owner's accents, or an empty string.
 *
 * Empty when nothing is set, so the common case adds no element at all rather
 * than an override that restates the defaults.
 *
 * The supporting shades are derived with `color-mix` instead of being asked for.
 * A hover state and a pressed state are not decisions an owner has an opinion
 * about, and asking for five colours to get one is how a theme editor becomes
 * something nobody touches. Mixing happens in the browser, against the colour
 * actually in effect, so the relationship holds whatever the accent becomes.
 */
export function themeStyle(theme: ThemeSettings): string {
  const declarations: string[] = [];

  if (theme.accent) {
    declarations.push(
      `--accent:${theme.accent}`,
      `--accent-strong:color-mix(in srgb, ${theme.accent} 82%, #000)`,
      `--accent-deep:color-mix(in srgb, ${theme.accent} 66%, #000)`,
      `--glow-accent:0 0 0 1px color-mix(in srgb, ${theme.accent} 24%, transparent), 0 18px 44px -26px color-mix(in srgb, ${theme.accent} 40%, transparent)`,
      `--glow-1:color-mix(in srgb, ${theme.accent} 14%, transparent)`,
    );
  }

  if (theme.accent2) {
    declarations.push(
      `--accent-2:${theme.accent2}`,
      `--glow-2:color-mix(in srgb, ${theme.accent2} 12%, transparent)`,
    );
  }

  return declarations.length > 0 ? `:root{${declarations.join(";")}}` : "";
}

/**
 * Contrast between a colour and the text written on it, as WCAG defines it.
 *
 * Here because the accent carries words — every primary button label, every
 * pill — and a brand colour chosen for how it looks against a dark background
 * can quietly fail to be readable. The panel warns rather than refuses: it is
 * the owner's store, and a colour used for a border rather than a button may be
 * a perfectly deliberate choice.
 */
function channel(value: number): number {
  return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number | null {
  const colour = safeColour(hex);

  if (!colour) {
    return null;
  }

  const digits =
    colour.length === 4
      ? colour
          .slice(1)
          .split("")
          .map((part) => part + part)
      : [colour.slice(1, 3), colour.slice(3, 5), colour.slice(5, 7)];

  const [r, g, b] = digits.map((part) => channel(Number.parseInt(part, 16) / 255));

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number | null {
  const [first, second] = [luminance(a), luminance(b)];

  if (first === null || second === null) {
    return null;
  }

  const [lighter, darker] = first >= second ? [first, second] : [second, first];

  return (lighter + 0.05) / (darker + 0.05);
}

/** The colour the accent's own text is written in, near-white in both themes. */
export const ACCENT_INK = "#f6fcff";

/** WCAG AA for normal text. Large text passes at 3:1, but button labels are not large. */
export const AA_NORMAL_TEXT = 4.5;

export function accentIsReadable(accent: string): boolean {
  const ratio = contrastRatio(accent, ACCENT_INK);

  return ratio !== null && ratio >= AA_NORMAL_TEXT;
}
