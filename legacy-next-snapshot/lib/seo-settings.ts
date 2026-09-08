import type { Metadata } from "next";
import type { Locale } from "@/i18n/config";
import { buildPageMetadata } from "@/lib/seo";
import { resolvePageSeo } from "@/lib/settings/page-seo";
import { getPublicStoreSettings } from "@/lib/services/settings.service";

/**
 * Page metadata, with the owner's override applied.
 *
 * Separate from {@link buildPageMetadata}, which stays pure and synchronous:
 * this one reads settings, and a page that has nothing to override should not
 * have to care. The settings read is deduplicated per request, so a page paying
 * for it costs nothing beyond the read the layout already makes.
 *
 * The page passes its own wording as it always did. That copy is the fallback,
 * so an unset page is unchanged and a failed settings read degrades to it — a
 * store whose database is unreachable should still answer with a sensible title
 * rather than an empty one.
 */
export async function buildStorePageMetadata(input: {
  locale: Locale;
  /** Route path without the locale segment, and the key an override is stored under. */
  path: string;
  title: string;
  description: string;
  imageUrl?: string | null;
  noIndex?: boolean;
}): Promise<Metadata> {
  const settings = await getPublicStoreSettings();
  const resolved = resolvePageSeo(settings.seo.pages, input.path, input.locale, {
    title: input.title,
    description: input.description,
  });

  return buildPageMetadata({ ...input, ...resolved });
}
