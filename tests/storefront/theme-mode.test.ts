import { describe, expect, it } from "vitest";
import { DEFAULT_THEME_SETTINGS, themeStyle } from "../../storefront/app/lib/settings/theme-settings";
import { themeStyle as serverThemeStyle } from "../../storefront/app/.server/lib/settings/theme-settings";

describe("owner theme settings", () => {
  it.each(["slate", "midnight"] as const)("scopes %s dark surfaces away from light mode", darkShade => {
    const theme = { ...DEFAULT_THEME_SETTINGS, darkShade, lightTint: "cool" as const };
    const css = themeStyle(theme);
    expect(css).toContain(':root:not([data-theme="light"]){--canvas:');
    expect(css.match(/:root\{[^}]*\}/)?.[0] ?? "").not.toContain("--canvas:");
    expect(serverThemeStyle(theme)).toBe(css);
  });
});
