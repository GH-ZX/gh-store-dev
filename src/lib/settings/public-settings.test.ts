import { describe, expect, it } from "vitest";
import { BRAND, buildBrandName } from "@/lib/brand";
import { EMPTY_PUBLIC_SETTINGS, normalizePublicSettings } from "@/lib/settings/public-settings";

describe("branding settings", () => {
  it("normalizes a valid branding object", () => {
    const settings = normalizePublicSettings({
      branding: { name_ar: "متجري", name_en: "My Store", use_everywhere: true },
    });

    expect(settings.branding).toEqual({ nameAr: "متجري", nameEn: "My Store", useEverywhere: true });
  });

  it("defaults on a malformed or absent branding object", () => {
    const settings = normalizePublicSettings({ branding: "broken" });

    expect(settings.branding).toEqual({ nameAr: "", nameEn: "", useEverywhere: false });
    expect(EMPTY_PUBLIC_SETTINGS.branding).toEqual({ nameAr: "", nameEn: "", useEverywhere: false });
  });

  it("dates to the built-in brand when a branding value does not parse", () => {
    const settings = normalizePublicSettings({ branding: { name_ar: 42 } });

    expect(settings.branding).toEqual({ nameAr: "", nameEn: "", useEverywhere: false });
  });

  it("buildBrandName prefers the configured localized name", () => {
    const settings = normalizePublicSettings({
      branding: { name_ar: "متجري", name_en: "", use_everywhere: true },
    });

    expect(buildBrandName(settings, "ar")).toBe("متجري");
    expect(buildBrandName(settings, "en")).toBe(BRAND.name);
  });

  it("buildBrandName falls back to the built-in brand for empty names", () => {
    const settings = normalizePublicSettings({ branding: { name_ar: "", name_en: " " } });

    expect(buildBrandName(settings, "ar")).toBe(BRAND.name);
    expect(buildBrandName(settings, "en")).toBe(BRAND.name);
  });
});