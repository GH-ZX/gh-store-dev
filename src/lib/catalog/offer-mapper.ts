import type { Locale } from "@/i18n/config";

type OfferRow = {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string;
  description_ar: string | null;
  description_en: string | null;
  price: number;
  original_price: number | null;
  currency: string;
  is_sale: boolean;
};

export type StoreOffer = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price: number;
  originalPrice: number | null;
  currency: string;
  isSale: boolean;
};

export function toStoreOffer(row: OfferRow, locale: Locale): StoreOffer {
  const isArabic = locale === "ar";

  return {
    id: row.id,
    slug: row.slug,
    name: isArabic ? row.name_ar : row.name_en,
    description: isArabic ? row.description_ar : row.description_en,
    price: row.price,
    originalPrice: row.original_price,
    currency: row.currency,
    isSale: row.is_sale,
  };
}
