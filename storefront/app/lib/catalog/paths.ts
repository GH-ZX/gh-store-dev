import type { Locale } from "@/i18n/config";

/** Active items without a category still belong in the generic product catalog. */
export const UNCATEGORIZED_PRODUCT_PATH = "products";

export function productPath(
  locale: Locale,
  product: { categorySlug: string; slug: string },
): string {
  return `/${locale}/${encodeURIComponent(product.categorySlug)}/${encodeURIComponent(product.slug)}`;
}

export function offerPath(
  locale: Locale,
  product: { categorySlug: string; slug: string },
  offer: { slug: string },
): string {
  return `${productPath(locale, product)}/${encodeURIComponent(offer.slug)}`;
}
