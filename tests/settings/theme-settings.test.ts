import { describe, expect, it } from "vitest";
import {
  accentIsReadable,
  contrastRatio,
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
    expect(normalizeTheme({})).toEqual({ accent: null, accent2: null, defaultMode: "system" });
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
});

describe("the stylesheet an owner's accents produce", () => {
  it("is empty when nothing has been chosen, so no element is rendered", () => {
    expect(themeStyle({ accent: null, accent2: null, defaultMode: "system" })).toBe("");
  });

  it("derives the hover and pressed shades rather than asking for them", () => {
    const css = themeStyle({ accent: "#06607b", accent2: null, defaultMode: "system" });

    expect(css).toContain("--accent:#06607b");
    expect(css).toContain("--accent-strong:color-mix(in srgb, #06607b 82%, #000)");
    expect(css).toContain("--accent-deep:color-mix(in srgb, #06607b 66%, #000)");
  });

  it("leaves the second accent alone when only the first is set", () => {
    const css = themeStyle({ accent: "#06607b", accent2: null, defaultMode: "system" });

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
