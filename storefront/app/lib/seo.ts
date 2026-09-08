import type { MetaDescriptor } from "react-router";
import { APP_NAME, DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from "@/lib/app-config";
import type { StoreProduct } from "@/lib/catalog/product-mapper";
import type { StoreOffer } from "@/lib/catalog/offer-mapper";

const FALLBACK_SITE_URL = "https://gh-store.me";

export function getSiteUrl(env?: Record<string, string | undefined>): string {
  const configured = env?.APP_URL?.trim() || "";
  if (configured) {
    try {
      const url = new URL(configured);
      if ((url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password) {
        return url.origin;
      }
    } catch {
      // A malformed deployment setting must not produce invalid canonical URLs.
    }
  }
  return FALLBACK_SITE_URL;
}

/** Normalize a route path to a leading slash with no trailing slash. */
function normalizePath(path: string): string {
  const pathname = path.split(/[?#]/, 1)[0];
  if (!pathname || pathname === "/") {
    return "";
  }
  return `/${pathname.replace(/^\/+|\/+$/g, "")}`;
}

export function buildLocalePath(locale: Locale, path = ""): string {
  return `/${locale}${normalizePath(path)}`;
}

function isPaginatedPage(page: number | undefined): page is number {
  return typeof page === "number" && Number.isSafeInteger(page) && page > 1;
}

export function buildAbsoluteUrl(locale: Locale, path = "", siteUrl?: string, page?: number): string {
  const url = new URL(buildLocalePath(locale, path), getSiteUrl({ APP_URL: siteUrl }));
  if (isPaginatedPage(page)) url.searchParams.set("page", String(page));
  return url.href;
}

function absoluteImageUrl(imageUrl: string | null | undefined, siteUrl: string): string | null {
  if (!imageUrl?.trim()) return null;
  try {
    const url = new URL(imageUrl.trim(), getSiteUrl({ APP_URL: siteUrl }));
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

export type PageMetaInput = {
  locale: Locale;
  /** Route path without the locale segment, e.g. `/products`. */
  path?: string;
  /** The validated collection page returned by its loader; page 1 has no query. */
  page?: number;
  title: string;
  description: string;
  imageUrl?: string | null;
  imageAlt?: string | null;
  type?: "website" | "product";
  /** Set for pages that must never be indexed, such as search result pages. */
  noIndex?: boolean;
  siteUrl?: string;
};

/**
 * Canonical URLs, hreflang alternates, OpenGraph and Twitter cards as React
 * Router meta descriptors. Every localized page shares one content identity:
 * the canonical URL is the current locale's path, each locale is listed as an
 * alternate so crawlers serve Arabic to Arabic readers and English to English
 * readers, and `x-default` points at the default locale.
 */
export function buildPageMeta({
  locale,
  path = "",
  page,
  title,
  description,
  imageUrl,
  imageAlt,
  type = "website",
  noIndex = false,
  siteUrl = FALLBACK_SITE_URL,
}: PageMetaInput): MetaDescriptor[] {
  const url = buildAbsoluteUrl(locale, path, siteUrl, page);
  const image = absoluteImageUrl(imageUrl, siteUrl);
  const pageTitle = isPaginatedPage(page)
    ? `${title} — ${locale === "ar" ? "الصفحة" : "Page"} ${page}`
    : title;
  const meta: MetaDescriptor[] = [
    { title: pageTitle },
    { name: "description", content: description },
    { tagName: "link", rel: "canonical", href: url },
    ...SUPPORTED_LOCALES.map((supported) => ({
      tagName: "link" as const,
      rel: "alternate",
      hrefLang: supported,
      href: buildAbsoluteUrl(supported, path, siteUrl, page),
    })),
    {
      tagName: "link" as const,
      rel: "alternate",
      hrefLang: "x-default",
      href: buildAbsoluteUrl(DEFAULT_LOCALE, path, siteUrl, page),
    },
    { property: "og:type", content: type },
    { property: "og:site_name", content: APP_NAME },
    { property: "og:locale", content: locale === "ar" ? "ar_SY" : "en_US" },
    { property: "og:locale:alternate", content: locale === "ar" ? "en_US" : "ar_SY" },
    { property: "og:title", content: pageTitle },
    { property: "og:description", content: description },
    { property: "og:url", content: url },
    { name: "twitter:title", content: pageTitle },
    { name: "twitter:description", content: description },
    {
      name: "twitter:card",
      content: image ? "summary_large_image" : "summary",
    },
  ];

  if (image) {
    meta.push(
      { property: "og:image", content: image },
      { property: "og:image:alt", content: imageAlt?.trim() || title },
      { name: "twitter:image", content: image },
      { name: "twitter:image:alt", content: imageAlt?.trim() || title },
    );
  }

  if (noIndex) {
    meta.push({ name: "robots", content: "noindex, follow" });
  } else {
    meta.push({ name: "robots", content: "max-image-preview:large" });
  }

  return meta;
}

/** Organization identity for an online storefront, without invented physical premises. */
export function buildOrganizationJsonLd(siteUrl: string, name = APP_NAME): Record<string, unknown>[] {
  const origin = getSiteUrl({ APP_URL: siteUrl });
  return [
    {
      "@context": "https://schema.org",
      "@type": "OnlineStore",
      "@id": `${origin}/#organization`,
      name,
      url: origin,
      logo: `${origin}/gh-store-logo-mark.png`,
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": `${origin}/#website`,
      name,
      url: origin,
      inLanguage: [...SUPPORTED_LOCALES],
      publisher: { "@id": `${origin}/#organization` },
    },
  ];
}

/** Use the visible catalog description when supplied, with a useful localized fallback. */
export function buildCatalogDescription({
  locale,
  productName,
  description,
  offerName,
  offerDescription,
}: {
  locale: Locale;
  productName: string;
  description?: string | null;
  offerName?: string;
  offerDescription?: string | null;
}): string {
  const content = offerDescription?.trim() || description?.trim();
  if (content) return content.replace(/\s+/g, " ");
  if (offerName) {
    return locale === "ar"
      ? `${offerName} لـ ${productName} في GH Store. اطّلع على السعر ومتطلبات الطلب وتفاصيل التسليم.`
      : `${offerName} for ${productName} at GH Store. View the price, order requirements, and delivery details.`;
  }
  return locale === "ar"
    ? `تصفّح عروض ${productName} في GH Store. قارن الباقات والأسعار واختر العرض المناسب لك.`
    : `Browse ${productName} offers at GH Store. Compare packages and prices to choose the right offer for you.`;
}

export function buildCollectionDescription({
  locale,
  categoryName,
  description,
}: {
  locale: Locale;
  categoryName: string;
  description?: string | null;
}): string {
  if (description?.trim()) return description.trim().replace(/\s+/g, " ");
  return locale === "ar"
    ? `تصفّح منتجات وعروض ${categoryName} في GH Store. قارن الباقات والأسعار وتفاصيل التسليم.`
    : `Browse ${categoryName} products and offers at GH Store. Compare packages, prices, and delivery details.`;
}

export function buildBreadcrumbJsonLd({
  locale,
  siteUrl = FALLBACK_SITE_URL,
  items,
}: {
  locale: Locale;
  siteUrl?: string;
  items: { name: string; path: string }[];
}): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map(({ name, path }, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name,
      item: buildAbsoluteUrl(locale, path, siteUrl),
    })),
  };
}

/**
 * One sellable package on its own detail page. Different packages are not an
 * AggregateOffer, and availability is omitted because provider stock is not read here.
 */
export function buildOfferJsonLd({
  locale,
  siteUrl = FALLBACK_SITE_URL,
  product,
  offer,
}: {
  locale: Locale;
  siteUrl?: string;
  product: Pick<StoreProduct, "slug" | "categorySlug" | "name" | "description" | "imageUrl" | "logoUrl">;
  offer: Pick<StoreOffer, "id" | "slug" | "name" | "description" | "imageUrl" | "price" | "currency">;
}): Record<string, unknown> {
  const path = `/${[product.categorySlug, product.slug, offer.slug].map(encodeURIComponent).join("/")}`;
  const url = buildAbsoluteUrl(locale, path, siteUrl);
  const image = absoluteImageUrl(offer.imageUrl || product.imageUrl || product.logoUrl, siteUrl);
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${url}#product`,
    name: `${offer.name} — ${product.name}`,
    description: buildCatalogDescription({
      locale,
      productName: product.name,
      description: product.description,
      offerName: offer.name,
      offerDescription: offer.description,
    }),
    sku: offer.id,
    url,
    ...(image ? { image: [image] } : {}),
  };
  // Only publish prices the catalog can actually express as a valid monetary amount.
  if (Number.isFinite(offer.price) && offer.price >= 0 && /^[A-Z]{3}$/.test(offer.currency)) {
    data.offers = {
      "@type": "Offer",
      url,
      price: offer.price,
      priceCurrency: offer.currency,
      seller: { "@id": `${getSiteUrl({ APP_URL: siteUrl })}/#organization` },
    };
  }
  return data;
}
