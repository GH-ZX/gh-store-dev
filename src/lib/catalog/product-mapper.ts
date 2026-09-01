import type { Locale } from "@/i18n/config";

export type ProductRow = {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string;
  description_ar: string | null;
  description_en: string | null;
  points_name_ar: string | null;
  points_name_en: string | null;
  image_url: string | null;
  logo_url: string | null;
  is_featured: boolean;
  carousel_badge_ar?: string | null;
  carousel_badge_en?: string | null;
  carousel_focus_x?: number | null;
  carousel_focus_y?: number | null;
  carousel_color?: string | null;
  carousel_logo_tone?: string | null;
  categories?: { slug: string } | { slug: string }[] | null;
};

export type StoreProduct = {
  id: string;
  slug: string;
  categorySlug: string;
  name: string;
  description: string | null;
  pointsName: string | null;
  imageUrl: string | null;
  logoUrl: string | null;
  isFeatured: boolean;
  carouselBadge: string | null;
  /** Background-position percentages for hero artwork, so faces stay in frame. */
  carouselFocus: { x: number; y: number };
  /** Admin-chosen accent colour for the carousel thumbnail line. */
  carouselColor: string | null;
  /** Duotone recolor for the carousel logo: "light" (white), "dark" (black), or null to keep the original. */
  carouselLogoTone: "light" | "dark" | null;
  /**
   * Cheapest active offer, when the caller enriched the game with prices.
   * Optional because the mapper itself stays row-pure; a tile without it
   * simply renders no price line.
   */
  priceFrom?: number | null;
};

/** Columns every product read selects, so a mapped product renders the same everywhere. */
export const PRODUCT_SELECT =
  "id, slug, name_ar, name_en, description_ar, description_en, points_name_ar, points_name_en, image_url, logo_url, is_featured, carousel_badge_ar, carousel_badge_en, carousel_focus_x, carousel_focus_y, carousel_color, carousel_logo_tone, categories!products_category_id_fkey(slug)";

function focusPercentage(value: number | null | undefined): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 50;
  }

  return Math.min(100, Math.max(0, value));
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function toStoreProduct(row: ProductRow, locale: Locale): StoreProduct {
  const isArabic = locale === "ar";
  const cat = firstRelation(row.categories);

  return {
    id: row.id,
    slug: row.slug,
    categorySlug: cat?.slug ?? "games",
    name: isArabic ? row.name_ar : row.name_en,
    description: isArabic ? row.description_ar : row.description_en,
    pointsName: isArabic ? row.points_name_ar : row.points_name_en,
    imageUrl: row.image_url,
    logoUrl: row.logo_url,
    isFeatured: row.is_featured,
    carouselBadge: (isArabic ? row.carousel_badge_ar : row.carousel_badge_en) ?? null,
    carouselFocus: {
      x: focusPercentage(row.carousel_focus_x),
      y: focusPercentage(row.carousel_focus_y),
    },
    carouselColor: row.carousel_color ?? null,
    carouselLogoTone:
      row.carousel_logo_tone === "light" || row.carousel_logo_tone === "dark"
        ? row.carousel_logo_tone
        : null,
  };
}
