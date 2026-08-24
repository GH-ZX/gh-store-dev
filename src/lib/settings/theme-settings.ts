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

/**
 * The rest of the personality, beyond colour.
 *
 * Each dimension is a named token set, not free-form values: an owner picks a
 * personality and the token file guarantees it composes with every other
 * choice. That is what keeps the editor growing without the combinations
 * exploding — seven dimensions of named options compose; sixty raw inputs do
 * not.
 */

/** How round the world is. Swaps the whole radius scale. */
export const CORNER_STYLES = ["sharp", "soft", "round"] as const;
export type CornerStyle = (typeof CORNER_STYLES)[number];

/** The dark canvas's temperature. */
export const DARK_SHADES = ["midnight", "navy", "slate"] as const;
export type DarkShade = (typeof DARK_SHADES)[number];

/** The light canvas's paper. */
export const LIGHT_TINTS = ["cool", "warm", "white"] as const;
export type LightTint = (typeof LIGHT_TINTS)[number];

/** How loud the ambient backdrop is, when one is chosen at all. */
export const BACKDROP_INTENSITIES = ["off", "subtle", "standard", "rich"] as const;
export type BackdropIntensity = (typeof BACKDROP_INTENSITIES)[number];

/** How much room content takes. Compact shrinks the rem so phones see more. */
export const DENSITIES = ["comfortable", "compact"] as const;
export type Density = (typeof DENSITIES)[number];

/** The voice headings speak in. Latin display faces; Arabic falls back gracefully per glyph. */
export const HEADING_FONTS = ["clean", "techy", "grotesk", "sora"] as const;
export type HeadingFont = (typeof HEADING_FONTS)[number];

/** How much the store moves. Calm shortens every duration token at once. */
export const MOTION_LEVELS = ["full", "calm"] as const;
export type MotionLevel = (typeof MOTION_LEVELS)[number];

/**
 * The ambient layer behind the whole storefront.
 *
 * One fixed element and one CSS rule per option: no canvas, no animation frame,
 * no second element per blob. The reference store animates three blurred blobs
 * for the same effect, which is a compositor running for as long as the tab is
 * open — on a phone that is battery spent on something nobody is looking at.
 * These hold still, and everything they are drawn from is already a token, so
 * each one follows the owner's accents and both themes for free.
 */
export const BACKDROPS = ["none", "aurora", "mesh", "grid"] as const;
export type Backdrop = (typeof BACKDROPS)[number];

export type ThemeSettings = {
  /** Null means "use the token file's own value". */
  accent: string | null;
  accent2: string | null;
  /** What a first-time visitor gets before they have chosen for themselves. */
  defaultMode: ThemeMode;
  backdrop: Backdrop;
  cornerStyle: CornerStyle;
  darkShade: DarkShade;
  lightTint: LightTint;
  backdropIntensity: BackdropIntensity;
  density: Density;
  headingFont: HeadingFont;
  motionLevel: MotionLevel;
};

export const DEFAULT_THEME_SETTINGS: ThemeSettings = {
  accent: null,
  accent2: null,
  defaultMode: "system",
  backdrop: "none",
  cornerStyle: "soft",
  darkShade: "navy",
  lightTint: "cool",
  backdropIntensity: "standard",
  density: "comfortable",
  headingFont: "clean",
  motionLevel: "full",
};

const themeSchema = z.object({
  accent: z.string().nullish(),
  accent_2: z.string().nullish(),
  default_mode: z.string().nullish(),
  backdrop: z.string().nullish(),
  corner_style: z.string().nullish(),
  dark_shade: z.string().nullish(),
  light_tint: z.string().nullish(),
  backdrop_intensity: z.string().nullish(),
  density: z.string().nullish(),
  heading_font: z.string().nullish(),
  motion_level: z.string().nullish(),
});

/** A colour we are willing to write into a stylesheet, or null. */
export function safeColour(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim().toLowerCase();

  return HEX_COLOUR.test(trimmed) ? trimmed : null;
}

function enumReader<T extends string>(values: readonly T[], fallback: T) {
  return (value: unknown): T =>
    typeof value === "string" && (values as readonly string[]).includes(value)
      ? (value as T)
      : fallback;
}

function readMode(value: unknown): ThemeMode {
  return enumReader(THEME_MODES, "system")(value);
}

export function readBackdrop(value: unknown): Backdrop {
  return enumReader(BACKDROPS, "none")(value);
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
    backdrop: readBackdrop(parsed.data.backdrop),
    cornerStyle: enumReader(CORNER_STYLES, DEFAULT_THEME_SETTINGS.cornerStyle)(parsed.data.corner_style),
    darkShade: enumReader(DARK_SHADES, DEFAULT_THEME_SETTINGS.darkShade)(parsed.data.dark_shade),
    lightTint: enumReader(LIGHT_TINTS, DEFAULT_THEME_SETTINGS.lightTint)(parsed.data.light_tint),
    backdropIntensity: enumReader(
      BACKDROP_INTENSITIES,
      DEFAULT_THEME_SETTINGS.backdropIntensity,
    )(parsed.data.backdrop_intensity),
    density: enumReader(DENSITIES, DEFAULT_THEME_SETTINGS.density)(parsed.data.density),
    headingFont: enumReader(HEADING_FONTS, DEFAULT_THEME_SETTINGS.headingFont)(parsed.data.heading_font),
    motionLevel: enumReader(MOTION_LEVELS, DEFAULT_THEME_SETTINGS.motionLevel)(parsed.data.motion_level),
  };
}

/**
 * The CSS that applies an owner's accents, or an empty string.
 *
 * Empty when nothing is set, so the common case adds no element at all rather
 * than an override that restates the defaults.
 *
 * Two ideas carry the design:
 *
 * **The shades are derived, not asked for.** A hover state and a pressed state
 * are not decisions an owner has an opinion about. Mixing happens in the
 * browser in OKLab — perceptually even, where sRGB mixing turns a saturated
 * accent muddy long before it looks "darker" — against the colour actually in
 * effect, so the relationship holds whatever the accent becomes.
 *
 * **The accent adapts to each mode instead of serving one and breaking the
 * other.** A single accent must carry its own button labels in dark *and*
 * light, and the two modes want opposite personalities: dark glows with a vivid
 * fill under dark text, light reads best with a deep fill under pale text. So
 * the ink written on the accent is chosen here, by measured contrast rather
 * than hope, and a colour too bright for the light theme is deepened into a
 * sibling of itself there while keeping its hue everywhere else.
 */
export function themeStyle(theme: ThemeSettings): string {
  const declarations: string[] = [];
  const lightDeclarations: string[] = [];
  /** Whole extra rules, for overrides that cannot live inside one `:root` block. */
  const extraRules: string[] = [];

  /*
   * Corner personality. Only the two non-default scales are written; "soft" is
   * what tokens.css already ships, so it costs nothing.
   */
  if (theme.cornerStyle === "sharp") {
    declarations.push(
      "--radius-shell:0.6rem",
      "--radius-card:0.45rem",
      "--radius-inner:0.3rem",
      "--radius-control:0.3rem",
    );
  } else if (theme.cornerStyle === "round") {
    declarations.push(
      "--radius-shell:2.25rem",
      "--radius-card:1.75rem",
      "--radius-inner:1.35rem",
      "--radius-control:1.15rem",
    );
  }

  /*
   * Dark canvas temperature. Navy is shipped; midnight and slate re-derive the
   * surface ramp around their own hue so panels keep their separation.
   */
  if (theme.darkShade === "midnight") {
    declarations.push(
      "--canvas:#020509",
      "--canvas-raised:#050b12",
      "--surface:#091320",
      "--surface-strong:#0d1a29",
      "--surface-inset:#010306",
    );
  } else if (theme.darkShade === "slate") {
    declarations.push(
      "--canvas:#0b111f",
      "--canvas-raised:#101827",
      "--surface:#151f30",
      "--surface-strong:#1c2839",
      "--surface-inset:#080d17",
    );
  }

  /*
   * Light canvas paper. Cool is shipped; warm and white re-tint the ramp, and
   * warm carries its own hairlines so borders stay warm with the paper.
   */
  if (theme.lightTint === "warm") {
    lightDeclarations.push(
      "--canvas:#faf6ee",
      "--canvas-raised:#f3ecdf",
      "--surface:#fffdf8",
      "--surface-strong:#f5eee2",
      "--surface-inset:#ece2d0",
      "--line:rgba(64,50,26,0.12)",
      "--line-strong:rgba(64,50,26,0.22)",
    );
  } else if (theme.lightTint === "white") {
    lightDeclarations.push(
      "--canvas:#ffffff",
      "--canvas-raised:#f3f6fa",
      "--surface:#ffffff",
      "--surface-strong:#edf2f7",
      "--surface-inset:#e6ecf2",
    );
  }

  /*
   * Motion level. Full is shipped — the stylesheet's own fallbacks carry it —
   * so only calm writes anything: shorter duration tokens everywhere, and an
   * entrance that trades its blur for a plain quick rise.
   */
  if (theme.motionLevel === "calm") {
    declarations.push(
      "--duration-fast:120ms",
      "--duration:200ms",
      "--duration-slow:340ms",
      "--ease-spring:cubic-bezier(0.33, 1, 0.68, 1)",
      "--ease-out-expo:cubic-bezier(0.25, 1, 0.5, 1)",
      "--enter-duration:260ms",
      "--enter-rise:10px",
      "--enter-blur:0px",
    );
  }

  /*
   * Density works through the rem: compact sets the root font-size down one
   * step, so every rem-denominated gap, radius and text shrinks together and
   * nothing per-component needs to know density exists.
   */
  if (theme.density === "compact") {
    extraRules.push("html{font-size:93.75%}");
  }

  /*
   * Heading voice. Maps onto the font variables next/font loads in the root
   * layout; the brand wordmark stays Tektur whatever this says — the logo is a
   * signature, not a style. "Clean" is the stylesheet's own fallback, so it
   * writes nothing.
   */
  if (theme.headingFont !== "clean") {
    const HEADING_FONT_VARIABLES: Record<Exclude<HeadingFont, "clean">, string> = {
      techy: "var(--font-tektur)",
      grotesk: "var(--font-space-grotesk)",
      sora: "var(--font-sora)",
    };

    declarations.push(`--font-display:${HEADING_FONT_VARIABLES[theme.headingFont]}`);
  }

  if (theme.accent) {
    const accent = theme.accent;

    // Dark mode: keep the owner's colour verbatim and pick its label ink.
    declarations.push(
      `--accent:${accent}`,
      `--accent-ink:${inkFor(accent)}`,
      `--accent-strong:color-mix(in oklab, ${accent} 78%, #fff)`,
      `--accent-deep:color-mix(in oklab, ${accent} 62%, #000)`,
      `--accent-soft:color-mix(in srgb, ${accent} 14%, transparent)`,
      `--accent-line:color-mix(in srgb, ${accent} 36%, transparent)`,
      `--focus:color-mix(in oklab, ${accent} 78%, #fff)`,
      `--glow-accent:0 0 0 1px color-mix(in srgb, ${accent} 24%, transparent), 0 18px 44px -26px color-mix(in srgb, ${accent} 40%, transparent)`,
      `--glow-1:color-mix(in srgb, ${accent} 14%, transparent)`,
    );

    // Light mode: a colour that cannot carry pale text is deepened into a
    // sibling of itself; one that can passes through untouched.
    const lightAccent = carriesPaleText(accent) ? accent : deepen(accent);

    lightDeclarations.push(
      `--accent:${lightAccent}`,
      `--accent-ink:${ACCENT_INK}`,
      `--accent-strong:color-mix(in oklab, ${lightAccent} 84%, #000)`,
      `--accent-deep:color-mix(in oklab, ${lightAccent} 68%, #000)`,
      `--accent-soft:color-mix(in srgb, ${lightAccent} 10%, transparent)`,
      `--accent-line:color-mix(in srgb, ${lightAccent} 30%, transparent)`,
      `--focus:${lightAccent}`,
    );
  }

  if (theme.accent2) {
    declarations.push(
      `--accent-2:${theme.accent2}`,
      `--accent-2-ink:${inkFor(theme.accent2)}`,
      `--glow-2:color-mix(in srgb, ${theme.accent2} 12%, transparent)`,
    );

    const lightAccent2 = carriesPaleText(theme.accent2) ? theme.accent2 : deepen(theme.accent2);

    lightDeclarations.push(`--accent-2:${lightAccent2}`, `--accent-2-ink:${ACCENT_INK}`);
  }

  if (declarations.length === 0 && lightDeclarations.length === 0 && extraRules.length === 0) {
    return "";
  }

  let css = declarations.length > 0 ? `:root{${declarations.join(";")}}` : "";

  if (lightDeclarations.length > 0) {
    css += `[data-theme="light"]{${lightDeclarations.join(";")}}`;
  }

  css += extraRules.join("");

  return css;
}

/** The near-black the dark theme writes on a bright accent. */
const DARK_INK = "#04121c";

/**
 * Whichever label ink reads better on this accent, by measurement.
 *
 * A vivid accent gets the near-black it was drawn beside; a deep one gets the
 * near-white every button label defaults to. Picking by contrast ratio rather
 * than assuming one answer is what lets a single owner-chosen colour work in
 * both themes.
 */
function inkFor(accent: string): string {
  const onDark = contrastRatio(accent, DARK_INK) ?? 0;
  const onPale = contrastRatio(accent, ACCENT_INK) ?? 0;

  return onDark >= onPale ? DARK_INK : ACCENT_INK;
}

/** Whether this colour survives as a fill under the near-white label ink. */
function carriesPaleText(accent: string): boolean {
  return (contrastRatio(accent, ACCENT_INK) ?? 0) >= AA_NORMAL_TEXT;
}

/**
 * Deepen a colour for the light theme while keeping its hue.
 *
 * Half-and-half into the canvas's own near-black, in OKLab, lands almost any
 * input past AA against pale text — bright neons included — without the grey
 * sludge the same operation produces in sRGB.
 */
function deepen(accent: string): string {
  return `color-mix(in oklab, ${accent} 46%, ${DARK_INK})`;
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

/**
 * What an accent resolves to in each mode, as paintable CSS values.
 *
 * The editor's preview cards draw exactly what the store will render — same
 * ink selection, same light-theme deepening — so a preset is judged on the
 * thing itself rather than on two flat swatches that hide the adaptation.
 * Values may be `color-mix()` expressions; CSS evaluates those natively.
 */
export type AccentModePaint = { accent: string; ink: string };

export function darkAccentPaint(accent: string): AccentModePaint {
  return { accent, ink: inkFor(accent) };
}

export function lightAccentPaint(accent: string): AccentModePaint {
  return { accent: carriesPaleText(accent) ? accent : deepen(accent), ink: ACCENT_INK };
}
