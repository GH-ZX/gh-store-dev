import type { Locale } from "@/i18n/config";

export type ProductKind =
  | "game"
  | "digital"
  | "subscription"
  | "service"
  | "virtual_currency"
  | "other";

export type ProductRow = {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string;
  description_ar: string | null;
  description_en: string | null;
  image_url: string | null;
  logo_url: string | null;
  product_kind: string;
  is_featured: boolean;
};

export type StoreProduct = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  logoUrl: string | null;
  kind: ProductKind;
  isFeatured: boolean;
};

/** Columns used by generic product reads. */
export const PRODUCT_SELECT =
  "id, slug, name_ar, name_en, description_ar, description_en, image_url, logo_url, product_kind, is_featured";

function toProductKind(value: string): ProductKind {
  return value === "game" ||
    value === "digital" ||
    value === "subscription" ||
    value === "service" ||
    value === "virtual_currency"
    ? value
    : "other";
}

export function toStoreProduct(row: ProductRow, locale: Locale): StoreProduct {
  return {
    id: row.id,
    slug: row.slug,
    name: locale === "ar" ? row.name_ar : row.name_en,
    description: locale === "ar" ? row.description_ar : row.description_en,
    imageUrl: row.image_url,
    logoUrl: row.logo_url,
    kind: toProductKind(row.product_kind),
    isFeatured: row.is_featured,
  };
}
