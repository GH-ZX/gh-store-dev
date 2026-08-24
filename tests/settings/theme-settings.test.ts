import { describe, expect, it } from "vitest";
import {
  accentIsReadable,
  contrastRatio,
  DEFAULT_THEME_SETTINGS,
  normalizeTheme,
  safeColour,
  themeStyle,
} from "@/lib/settings/theme-settings";

describe("colours we are willing to put in a stylesheet", () => {
  it("accepts both hex lengths, in any case", () => {
    expect(safeColour("#06607B")).toBe("#06607b");
    expect(safeColour("#abc")).toBe("#abc");
    expect(safeColour("  #06607b  ")).toBe("#06607b");
  });

  it("refuses anything that could close the declaration or the element", () => {
    /*
     * The whole point of the check. These values are written into a `<style>`
     * element, so a colour that can carry `}` or `<` can write its own CSS or
     * leave the element entirely.
     */
    expect(safeColour("red;}body{display:none")).toBeNull();
    expect(safeColour("#fff;}html{--accent:red}")).toBeNull();
    expect(safeColour("</style><script>alert(1)</script>")).toBeNull();
    expect(safeColour("url(https://example.com/x.png)")).toBeNull();
    expect(safeColour("expression(alert(1))")).toBeNull();
  });

  it("refuses colour formats that are valid CSS but not hex", () => {
    // Not because they are dangerous, but because one accepted shape is far
    // easier to keep safe than five.
    expect(safeColour("rebeccapurple")).toBeNull();
    expect(safeColour("rgb(6 96 123)")).toBeNull();
    expect(safeColour("#12345")).toBeNull();
    expect(safeColour(null)).toBeNull();
  });
});

describe("reading stored theme settings", () => {
  it("falls back to the token file when nothing is set", () => {
    expect(normalizeTheme({})).toEqual(DEFAULT_THEME_SETTINGS);
  });

  it("survives a hand-edited settings blob", () => {
    expect(normalizeTheme("nonsense").accent).toBeNull();
    expect(normalizeTheme({ accent: 12 }).accent).toBeNull();
  });

  it("discards an unsafe colour rather than the whole theme", () => {
    const theme = normalizeTheme({ accent: "red;}x{", accent_2: "#6a4fd8", default_mode: "light" });

    expect(theme.accent).toBeNull();
    expect(theme.accent2).toBe("#6a4fd8");
    expect(theme.defaultMode).toBe("light");
  });

  it("treats an unknown mode as the system preference", () => {
    expect(normalizeTheme({ default_mode: "sepia" }).defaultMode).toBe("system");
  });

  it("reads the backdrop, and treats an unknown one as no backdrop at all", () => {
    expect(normalizeTheme({ backdrop: "aurora" }).backdrop).toBe("aurora");
    // The value reaches an attribute selector, so anything unrecognised has to
    // land on the option that renders no element rather than an empty layer.
    expect(normalizeTheme({ backdrop: "fireworks" }).backdrop).toBe("none");
    expect(normalizeTheme({}).backdrop).toBe("none");
  });

  it("reads every personality dimension, falling back to the house default", () => {
    const chosen = normalizeTheme({
      corner_style: "sharp",
      dark_shade: "midnight",
      light_tint: "warm",
      backdrop_intensity: "rich",
      density: "compact",
      heading_font: "grotesk",
      motion_level: "calm",
    });

    expect(chosen.cornerStyle).toBe("sharp");
    expect(chosen.darkShade).toBe("midnight");
    expect(chosen.lightTint).toBe("warm");
    expect(chosen.backdropIntensity).toBe("rich");
    expect(chosen.density).toBe("compact");
    expect(chosen.headingFont).toBe("grotesk");
    expect(chosen.motionLevel).toBe("calm");

    const garbage = normalizeTheme({
      corner_style: "wobbly",
      dark_shade: "beige",
      light_tint: "neon",
      backdrop_intensity: "loud",
      density: "dense",
      heading_font: "comic-sans",
      motion_level: "wild",
    });

    expect(garbage).toEqual(DEFAULT_THEME_SETTINGS);
  });
});

describe("the stylesheet an owner's accents produce", () => {
  it("is empty when nothing has been chosen, so no element is rendered", () => {
    expect(themeStyle(DEFAULT_THEME_SETTINGS)).toBe("");
  });

  it("reskins the radius scale only when the corners are not the house default", () => {
    const sharp = themeStyle({ ...DEFAULT_THEME_SETTINGS, cornerStyle: "sharp" });
    const round = themeStyle({ ...DEFAULT_THEME_SETTINGS, cornerStyle: "round" });

    expect(sharp).toContain("--radius-card:0.45rem");
    expect(round).toContain("--radius-card:1.75rem");
    expect(themeStyle({ ...DEFAULT_THEME_SETTINGS, cornerStyle: "soft" })).toBe("");
  });

  it("re-derives the dark and light canvases around the chosen shade", () => {
    const midnight = themeStyle({ ...DEFAULT_THEME_SETTINGS, darkShade: "midnight" });

    expect(midnight).toContain("--canvas:#020509");

    const warm = themeStyle({ ...DEFAULT_THEME_SETTINGS, lightTint: "warm" });

    expect(warm).toContain('[data-theme="light"]');
    expect(warm).toContain("--canvas:#faf6ee");
  });

  it("tunes density through the root font size", () => {
    expect(themeStyle({ ...DEFAULT_THEME_SETTINGS, density: "compact" })).toContain(
      "html{font-size:93.75%}",
    );
    expect(themeStyle({ ...DEFAULT_THEME_SETTINGS, density: "comfortable" })).not.toContain(
      "font-size",
    );
  });

  it("retunes the entrance from tokens alone, per motion level", () => {
    // Full motion is the stylesheet's own fallback and writes nothing; calm
    // overrides the tokens — shorter everywhere, no blur.
    const calm = themeStyle({ ...DEFAULT_THEME_SETTINGS, motionLevel: "calm" });

    expect(calm).toContain("--enter-blur:0px");
    expect(calm).toContain("--enter-duration:260ms");
    expect(calm).toContain("--duration:200ms");
  });

  it("points headings at the chosen voice", () => {
    const grotesk = themeStyle({ ...DEFAULT_THEME_SETTINGS, headingFont: "grotesk" });

    expect(grotesk).toContain("--font-display:var(--font-space-grotesk)");
    // Clean is the stylesheet's own fallback and writes nothing.
    expect(themeStyle(DEFAULT_THEME_SETTINGS)).not.toContain("--font-display");
  });

  it("derives the hover and pressed shades rather than asking for them", () => {
    const css = themeStyle({ ...DEFAULT_THEME_SETTINGS, accent: "#06607b" });

    expect(css).toContain("--accent:#06607b");
    // Mixed in OKLab, so a saturated accent darkens without going muddy.
    expect(css).toContain("--accent-strong:color-mix(in oklab, #06607b 78%, #fff)");
    expect(css).toContain("--accent-deep:color-mix(in oklab, #06607b 62%, #000)");
    // Tinted fill and border tokens ship alongside the shades.
    expect(css).toContain("--accent-soft:");
    expect(css).toContain("--accent-line:");
  });

  it("picks the label ink by measured contrast, not by mode", () => {
    // A deep accent carries pale text; a bright one wants the near-black.
    const deep = themeStyle({ ...DEFAULT_THEME_SETTINGS, accent: "#06607b" });
    const bright = themeStyle({ ...DEFAULT_THEME_SETTINGS, accent: "#5ad8ff" });

    expect(deep).toContain("--accent-ink:#f6fcff");
    expect(bright).toContain("--accent-ink:#04121c");
  });

  it("adapts a bright accent for the light theme instead of breaking it", () => {
    // Vivid cyan passes on the dark canvas and fails under pale text; the
    // light block must deepen it into a sibling rather than ship unreadable
    // buttons. A colour that already passes goes through untouched.
    const bright = themeStyle({ ...DEFAULT_THEME_SETTINGS, accent: "#5ad8ff" });
    const deep = themeStyle({ ...DEFAULT_THEME_SETTINGS, accent: "#06607b" });

    expect(bright).toContain('[data-theme="light"]');
    expect(bright).toContain(`color-mix(in oklab, #5ad8ff 46%, #04121c)`);
    expect(deep).toContain(`[data-theme="light"]{--accent:#06607b`);
  });

  it("leaves the second accent alone when only the first is set", () => {
    const css = themeStyle({ ...DEFAULT_THEME_SETTINGS, accent: "#06607b" });

    expect(css).not.toContain("--accent-2:");
  });
});

describe("whether the accent can carry text", () => {
  it("measures contrast the way WCAG does", () => {
    // The accent this store ships with, against the near-white it writes on.
    expect(contrastRatio("#06607b", "#f6fcff")).toBeCloseTo(6.84, 1);
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 1);
  });

  it("is symmetric, since a ratio has no direction", () => {
    expect(contrastRatio("#06607b", "#f6fcff")).toBe(contrastRatio("#f6fcff", "#06607b"));
  });

  it("fails a light accent that would leave button labels unreadable", () => {
    expect(accentIsReadable("#7dd3fc")).toBe(false);
    expect(accentIsReadable("#06607b")).toBe(true);
  });

  it("fails the accent this store used to ship, which missed AA narrowly", () => {
    expect(accentIsReadable("#0b7fa6")).toBe(false);
  });

  it("has no answer for a colour it cannot read", () => {
    expect(contrastRatio("nonsense", "#fff")).toBeNull();
  });
});
