import type { Locale } from "@/i18n/config";

type GameRow = {
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
};

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
  };
}
