import type { Locale } from "@/i18n/config";
import { buildAbsoluteUrl, getSiteUrl } from "@/lib/seo";
import { formatPrice } from "@/lib/format/money";
import { productPath } from "@/lib/catalog/paths";

/**
 * Structured data for a product page and its offer list.
 *
 * Two things this layer has to get right, and neither is cosmetic:
 *
 * 1. **A name that means nothing must not be published as a name.** Supplier
 *    catalogues title a package with the bare denomination ("55", "86"), and
 *    the storefront's display layer may render that as "55 Diamond". Google
 *    reads `ItemList.name` and `Offer.name` as the identity of the thing being
 *    sold, so "55" is not a thin name — it is a wrong one, and thirty of them
 *    on one page make the page look like spam. When an offer's name carries no
 *    information beyond the amount, the entitlement is expressed the way a
 *    buyer would say it: "Mobile Legends — 55 Diamonds, $0.72", which is a
 *    truthful statement about what is on sale.
 *
 * 2. **A price must match the live offer.** `Offer.price`/`priceCurrency` are
 *    only emitted from the same numbers the page renders, and only when they
 *    are a valid monetary amount in a three-letter currency. No availability is
 *    claimed, because provider stock is not read here.
 */

/** The pieces of an offer this layer needs. Structural, so callers can pass a mapped offer. */
export type StructuredOffer = {
  id: string;
  slug: string;
  name: string;
  price: number;
  currency: string;
  regionCode?: string | null;
};

/** "55", "1,200", "٣٣٠" — an amount, not a name. */
const BARE_NUMBER = /^[\d\s.,\u0660-\u0669\u06f0-\u06f9]+$/;

/**
 * A name that is only a quantity, optionally followed by the product's unit
 * word: "55", "55 Diamonds", "55 ألماسة".
 *
 * Built from the product's own `points_name`, so the check follows the catalog
 * rather than a hard-coded word list.
 */
export function isMeaninglessOfferName(name: string, pointsName?: string | null): boolean {
  const trimmed = name.trim();
  if (!trimmed) return true;
  if (BARE_NUMBER.test(trimmed)) return true;

  const unit = pointsName?.trim();
  if (!unit) return false;

  const escaped = unit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const withUnit = new RegExp(`^[\\d\\s.,\\u0660-\\u0669\\u06f0-\\u06f9]+\\s*${escaped}$`, "i");
  return withUnit.test(trimmed);
}

/** True when a price can be published as structured data without lying. */
export function isPublishablePrice(price: number, currency: string): boolean {
  return Number.isFinite(price) && price >= 0 && /^[A-Z]{3}$/.test(currency);
}

/**
 * The buyer-facing identity of one package.
 *
 * Order of preference: the offer's own informative name, then the entitlement
 * spelled out against the product, then the product name alone. A price is
 * appended only when the name still would not distinguish two packages, so a
 * page of genuinely named packages keeps its clean titles.
 */
export function structuredOfferName({
  offerName,
  productName,
  pointsName,
  price,
  currency,
  locale,
}: {
  offerName: string;
  productName: string;
  pointsName?: string | null;
  price: number;
  currency: string;
  locale: Locale;
}): string {
  const trimmed = offerName.trim();
  const informative = trimmed.length > 0 && !isMeaninglessOfferName(trimmed, pointsName);

  if (informative) {
    return trimmed === productName.trim() ? productName.trim() : `${trimmed} — ${productName.trim()}`;
  }

  // The supplier name is only an amount. Say what it buys, against the product
  // whose unit it is, and attach the real price so two amounts never collide.
  const amount = trimmed || (Number.isFinite(price) ? formatPrice(price, currency, locale) : "");
  const entitlement = amount && amount !== productName.trim() ? amount : "";
  const base = entitlement ? `${productName.trim()} — ${entitlement}` : productName.trim();
  if (!Number.isFinite(price) || !/^[A-Z]{3}$/.test(currency)) return base;
  return `${base}, ${formatPrice(price, currency, locale)}`;
}

/**
 * One `ListItem` per active offer, with unique names.
 *
 * A duplicate name is as unhelpful as a numeric one, so a repeat is qualified
 * with its own price rather than being emitted twice identically.
 */
export function buildOfferListJsonLd({
  locale,
  siteUrl = "https://gh-store.me",
  product,
  offers,
}: {
  locale: Locale;
  siteUrl?: string;
  product: {
    slug: string;
    categorySlug: string;
    name: string;
    pointsName?: string | null;
  };
  offers: readonly StructuredOffer[];
}): Record<string, unknown> | null {
  if (offers.length === 0) return null;

  const seen = new Map<string, number>();
  const items = offers.map((offer, index) => {
    const base = structuredOfferName({
      offerName: offer.name,
      productName: product.name,
      pointsName: product.pointsName,
      price: offer.price,
      currency: offer.currency,
      locale,
    });
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    const name = count === 0
      ? base
      : isPublishablePrice(offer.price, offer.currency)
        ? `${base} (${formatPrice(offer.price, offer.currency, locale)})`
        : `${base} (${index + 1})`;

    return {
      "@type": "ListItem",
      position: index + 1,
      name,
      url: `${getSiteUrl({ APP_URL: siteUrl })}${productPath(locale, product)}/${encodeURIComponent(offer.slug)}`,
    };
  });

  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: product.name,
    numberOfItems: items.length,
    itemListElement: items,
  };
}

/**
 * A `Product` with its cheapest truthful `Offer`.
 *
 * This is the page-level product identity Google needs to understand the page;
 * the `ItemList` above is the package menu. Both are emitted, and the `Offer`
 * carries only what the catalog can prove: amount, currency and seller.
 */
export function buildProductJsonLd({
  locale,
  siteUrl = "https://gh-store.me",
  product,
  offers,
  imageUrl,
}: {
  locale: Locale;
  siteUrl?: string;
  product: {
    slug: string;
    categorySlug: string;
    name: string;
    description?: string | null;
    categoryName?: string | null;
  };
  offers: readonly StructuredOffer[];
  imageUrl?: string | null;
}): Record<string, unknown> | null {
  const priced = offers.filter((offer) => isPublishablePrice(offer.price, offer.currency));
  if (priced.length === 0) return null;
  const cheapest = priced.reduce((lowest, offer) => (offer.price < lowest.price ? offer : lowest));

  const origin = getSiteUrl({ APP_URL: siteUrl });
  const url = buildAbsoluteUrl(locale, productPath(locale, product), siteUrl);
  const image = absoluteImage(imageUrl, origin);

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${url}#product`,
    name: product.name,
    url,
    ...(product.description?.trim() ? { description: product.description.trim().replace(/\s+/g, " ") } : {}),
    ...(product.categoryName?.trim() ? { category: product.categoryName.trim() } : {}),
    ...(image ? { image: [image] } : {}),
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: cheapest.currency,
      lowPrice: cheapest.price,
      highPrice: priced.reduce((highest, offer) => (offer.price > highest.price ? offer : highest)).price,
      offerCount: priced.length,
      url,
      seller: { "@id": `${origin}/#organization` },
    },
  };
}

function absoluteImage(imageUrl: string | null | undefined, origin: string): string | null {
  if (!imageUrl?.trim()) return null;
  try {
    const url = new URL(imageUrl.trim(), origin);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}
