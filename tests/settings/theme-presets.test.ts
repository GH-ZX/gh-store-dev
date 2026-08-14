import { describe, expect, it } from "vitest";
import { SUPPORTED_LOCALES } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { matchThemePreset, THEME_PRESETS } from "@/lib/settings/theme-presets";
import {
  AA_NORMAL_TEXT,
  ACCENT_INK,
  contrastRatio,
  DEFAULT_THEME_SETTINGS,
  safeColour,
} from "@/lib/settings/theme-settings";

describe("theme presets", () => {
  it("offers each preset once", () => {
    const ids = THEME_PRESETS.map((preset) => preset.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("holds colours the store is willing to write into a stylesheet", () => {
    for (const preset of THEME_PRESETS) {
      expect(safeColour(preset.accent), preset.id).toBe(preset.accent);
      expect(safeColour(preset.accent2), preset.id).toBe(preset.accent2);
    }
  });

  /*
   * The accent carries every button label in the store. A preset that fails this
   * is not a taste question — it ships unreadable text under the store's own
   * recommendation, which is worse than making the owner pick a colour
   * themselves.
   */
  it("recommends only accents that carry their own label", () => {
    for (const preset of THEME_PRESETS) {
      const ratio = contrastRatio(preset.accent, ACCENT_INK);

      expect(ratio, `${preset.id} (${preset.accent})`).not.toBeNull();
      expect(ratio!, `${preset.id} (${preset.accent})`).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    }
  });

  // The chip renders `presets[id]`, so a preset added without copy shows an
  // empty button rather than failing anywhere a person would notice.
  it("has a name in every language", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const names: Record<string, string> = getMessages(locale, "admin").website.theme.presets;

      for (const preset of THEME_PRESETS) {
        expect(names[preset.id], `${preset.id} in ${locale}`).toBeTruthy();
      }
    }
  });

  it("recognises the pair an owner is already on, and nothing else", () => {
    const preset = THEME_PRESETS[1];

    expect(
      matchThemePreset({ ...DEFAULT_THEME_SETTINGS, accent: preset.accent, accent2: preset.accent2 }),
    ).toEqual(preset);

    // Half a pair is not the preset: the second colour is visible in gradients
    // and glow, so a store with a different one does not look like this preset.
    expect(
      matchThemePreset({ ...DEFAULT_THEME_SETTINGS, accent: preset.accent, accent2: "#123456" }),
    ).toBeNull();
    expect(matchThemePreset(DEFAULT_THEME_SETTINGS)).toBeNull();
  });
});
