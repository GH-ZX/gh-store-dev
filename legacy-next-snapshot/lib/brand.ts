import type { Locale } from "@/i18n/config";
import type { PublicStoreSettings } from "@/lib/settings/public-settings";

export const BRAND = {
  name: "GH Store",
  technicalName: "GH-Store",
  defaultLocale: "ar",
  locales: ["ar", "en"],
} as const;

/**
 * The display name for a locale: the configured branding name when set,
 * otherwise the built-in brand. The owner can name a promotion on the
 * homepage tab without renaming the store itself — and when they choose to
 * use the name everywhere, the same resolution drives the chrome.
 */
export function buildBrandName(settings: PublicStoreSettings, locale: Locale): string {
  const configured = locale === "ar" ? settings.branding.nameAr : settings.branding.nameEn;
  return configured.trim().length > 0 ? configured.trim() : BRAND.name;
}