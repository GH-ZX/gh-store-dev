import { describe, expect, it } from "vitest";
import {
  getStorefrontThemeStyle,
  readableDarkAccent,
} from "@/lib/storefront-theme";
import {
  contrastRatio,
  DEFAULT_THEME_SETTINGS,
} from "@/lib/settings/theme-settings";

describe("customer accent contrast", () => {
  it.each(["#0f766e", "#000", "#123456", "#f00", "#ff00ff", "#ffffff"])(
    "keeps %s readable on all dark surfaces",
    (accent) => {
      const text = readableDarkAccent(accent);
      for (const surface of ["#101218", "#191c25", "#14171f", "#222632"]) {
        expect(contrastRatio(text, surface)).toBeGreaterThanOrEqual(4.5);
      }
    },
  );
  it("preserves the owner's button fill separately from normalized text", () => {
    const theme = { ...DEFAULT_THEME_SETTINGS, accent: "#0f766e" };
    const style = getStorefrontThemeStyle(theme) as Record<string, string>;
    expect(style["--sf-dark-accent"]).not.toBe(theme.accent);
    expect(style["--sf-dark-button"]).toBe(theme.accent);
    expect(
      contrastRatio(style["--sf-dark-button"], style["--sf-dark-button-ink"]),
    ).toBeGreaterThanOrEqual(4.5);
    expect(theme.accent).toBe("#0f766e");
  });
  it("keeps readable accents and default tokens unchanged", () => {
    expect(readableDarkAccent("#a0a7b8")).toBe("#a0a7b8");
    expect(getStorefrontThemeStyle(DEFAULT_THEME_SETTINGS)).toEqual({});
    expect(
      getStorefrontThemeStyle({
        ...DEFAULT_THEME_SETTINGS,
        accent: "url(example)",
      }),
    ).toEqual({});
  });
});
