import type { Locale } from "@/i18n/config";

/** Shape of the `games` relation when an offer read joins its parent game. */
type OfferGameRelation = {
  slug: string;
  name_ar: string;
  name_en: string;
  image_url: string | null;
  logo_url: string | null;
};

export type OfferRow = {
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
  region_code?: string | null;
  sale_image_url?: string | null;
  /** Supabase returns an object for a to-one join, but tolerate an array. */
  games?: OfferGameRelation | OfferGameRelation[] | null;
};

export type StoreOfferGame = {
  slug: string;
  name: string;
  imageUrl: string | null;
  logoUrl: string | null;
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
  regionCode: string | null;
  imageUrl: string | null;
  /** Present when the read joined the parent game, needed for offer links. */
  game: StoreOfferGame | null;
  /** Whole-percent discount, or null when there is no higher original price. */
  discountPercent: number | null;
};

/** Columns every offer read selects. */
export const OFFER_SELECT =
  "id, slug, offer_type, name_ar, name_en, description_ar, description_en, price, original_price, currency, is_sale, region_code, sale_image_url";

/** Offer columns plus the parent game fields needed to build an offer link. */
export const OFFER_WITH_GAME_SELECT = `${OFFER_SELECT}, games!inner (slug, name_ar, name_en, image_url, logo_url)`;

function firstRelation(
  value: OfferGameRelation | OfferGameRelation[] | null | undefined,
): OfferGameRelation | null {
  if (!value) {
    return null;
  }

  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function discountPercent(price: number, originalPrice: number | null): number | null {
  if (originalPrice === null || originalPrice <= price || originalPrice <= 0) {
    return null;
  }

  return Math.round(((originalPrice - price) / originalPrice) * 100);
}

export function toStoreOffer(row: OfferRow, locale: Locale): StoreOffer {
  const isArabic = locale === "ar";
  const offerType =
    row.offer_type === "gift_card" || row.offer_type === "redeem_code" ? row.offer_type : "topup";
  const game = firstRelation(row.games);

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
    regionCode: row.region_code ?? null,
    imageUrl: row.sale_image_url ?? game?.image_url ?? null,
    game: game
      ? {
          slug: game.slug,
          name: isArabic ? game.name_ar : game.name_en,
          imageUrl: game.image_url,
          logoUrl: game.logo_url,
        }
      : null,
    discountPercent: discountPercent(row.price, row.original_price),
  };
}
