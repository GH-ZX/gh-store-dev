import { z } from "zod";
import type { Locale } from "@/i18n/config";

/**
 * Per-page titles and descriptions.
 *
 * The homepage has had its own SEO block since stage 6; every other page carried
 * whatever the interface copy happened to say. Those two jobs are not the same
 * one — a page heading is read by someone already looking at the page, and a
 * search result is read by someone deciding whether to come — so the second is
 * now settable without disturbing the first.
 *
 * Keyed by route path, because the path is the identity the page already knows.
 * A key nothing renders is harmless, and a page with no entry keeps exactly the
 * metadata it had.
 *
 * Only pages worth finding are listed. Detail pages take their metadata from the
 * product they show, and account, checkout, and auth pages are `noindex` — an
 * SEO field for those would be a field with no effect, which is worse than its
 * absence.
 */

export const SEO_PAGE_PATHS = [
  "/games",
  "/gift-cards",
  "/sale",
  "/search",
  "/faq",
  "/how",
  "/contact",
  "/refunds",
  "/privacy",
  "/terms",
  "/links",
] as const;

export type SeoPagePath = (typeof SEO_PAGE_PATHS)[number];

export type PageSeo = {
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionEn: string;
};

export const EMPTY_PAGE_SEO: PageSeo = {
  titleAr: "",
  titleEn: "",
  descriptionAr: "",
  descriptionEn: "",
};

const pageSeoSchema = z.object({
  title_ar: z.string().trim().max(160).optional(),
  title_en: z.string().trim().max(160).optional(),
  description_ar: z.string().trim().max(320).optional(),
  description_en: z.string().trim().max(320).optional(),
});

export type PageSeoMap = Partial<Record<SeoPagePath, PageSeo>>;

export function isSeoPagePath(value: unknown): value is SeoPagePath {
  return typeof value === "string" && (SEO_PAGE_PATHS as readonly string[]).includes(value);
}

/**
 * Read the stored `seo.pages` object.
 *
 * Unknown keys are dropped rather than carried: they can only come from a hand
 * edit or a page that no longer exists, and keeping them would mean the editor
 * shows fields for a route that cannot be reached.
 */
export function normalizePageSeo(value: unknown): PageSeoMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const map: PageSeoMap = {};

  for (const [key, raw] of Object.entries(value)) {
    if (!isSeoPagePath(key)) {
      continue;
    }

    const parsed = pageSeoSchema.safeParse(raw ?? {});

    if (!parsed.success) {
      continue;
    }

    const entry: PageSeo = {
      titleAr: parsed.data.title_ar ?? "",
      titleEn: parsed.data.title_en ?? "",
      descriptionAr: parsed.data.description_ar ?? "",
      descriptionEn: parsed.data.description_en ?? "",
    };

    // An entry where every field is blank is the same as no entry, and storing
    // it would make the difference between "unset" and "cleared" visible in a
    // place where it does not exist.
    if (entry.titleAr || entry.titleEn || entry.descriptionAr || entry.descriptionEn) {
      map[key] = entry;
    }
  }

  return map;
}

/**
 * What one page should say, given what it already says.
 *
 * Each field falls back independently: an owner who writes only an Arabic
 * description gets their description in Arabic and the page's own wording in
 * English, rather than an override that is all-or-nothing.
 */
export function resolvePageSeo(
  pages: PageSeoMap,
  path: string,
  locale: Locale,
  fallback: { title: string; description: string },
): { title: string; description: string } {
  const entry = isSeoPagePath(path) ? pages[path] : undefined;

  if (!entry) {
    return fallback;
  }

  const title = locale === "ar" ? entry.titleAr : entry.titleEn;
  const description = locale === "ar" ? entry.descriptionAr : entry.descriptionEn;

  return {
    title: title || fallback.title,
    description: description || fallback.description,
  };
}
