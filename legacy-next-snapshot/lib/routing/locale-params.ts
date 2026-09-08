import { notFound } from "next/navigation";
import { isLocale, type Locale } from "@/i18n/config";

/**
 * Resolve the `[locale]` route segment.
 *
 * An unsupported locale is a 404 rather than a redirect: `/fr/games` is not a
 * page of this store, and silently serving Arabic under a French URL would let
 * crawlers index the same content under invented locales.
 */
export async function resolveLocaleParam(params: Promise<{ locale: string }>): Promise<Locale> {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  return locale;
}
