import type { Locale } from "@/i18n/config";

export type GameRow = {
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
};

export type StoreGame = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  pointsName: string | null;
  imageUrl: string | null;
  logoUrl: string | null;
  isFeatured: boolean;
  carouselBadge: string | null;
  /** Background-position percentages for hero artwork, so faces stay in frame. */
  carouselFocus: { x: number; y: number };
};

/** Columns every game read selects, so a mapped game renders the same everywhere. */
export const GAME_SELECT =
  "id, slug, name_ar, name_en, description_ar, description_en, points_name_ar, points_name_en, image_url, logo_url, is_featured, carousel_badge_ar, carousel_badge_en, carousel_focus_x, carousel_focus_y";

function focusPercentage(value: number | null | undefined): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 50;
  }

  return Math.min(100, Math.max(0, value));
}

export function toStoreGame(row: GameRow, locale: Locale): StoreGame {
  const isArabic = locale === "ar";

  return {
    id: row.id,
    slug: row.slug,
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
  };
}
