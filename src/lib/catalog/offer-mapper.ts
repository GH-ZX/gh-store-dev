import type { Locale } from "@/i18n/config";

type OfferRow = {
  id: string;
  slug: string;
  offer_type: string;
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
  offerType: "topup" | "gift_card" | "redeem_code";
  name: string;
  description: string | null;
  price: number;
  originalPrice: number | null;
  currency: string;
  isSale: boolean;
};

export function toStoreOffer(row: OfferRow, locale: Locale): StoreOffer {
  const isArabic = locale === "ar";
  const offerType = row.offer_type === "gift_card" || row.offer_type === "redeem_code"
    ? row.offer_type
    : "topup";

  return {
    id: row.id,
    slug: row.slug,
    offerType,
    name: isArabic ? row.name_ar : row.name_en,
    description: isArabic ? row.description_ar : row.description_en,
    price: row.price,
    originalPrice: row.original_price,
    currency: row.currency,
    isSale: row.is_sale,
  };
}
