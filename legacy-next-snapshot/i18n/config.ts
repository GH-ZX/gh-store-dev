import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  type Locale,
} from "@/lib/config/app";

export { DEFAULT_LOCALE, SUPPORTED_LOCALES };
export type { Locale };

export function isLocale(value: string): value is Locale {
  return SUPPORTED_LOCALES.includes(value as Locale);
}

export function getLocaleDirection(locale: Locale): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr";
}

export function getLocaleFromPathname(pathname: string): Locale | null {
  const locale = pathname.split("/")[1] ?? "";
  return isLocale(locale) ? locale : null;
}
