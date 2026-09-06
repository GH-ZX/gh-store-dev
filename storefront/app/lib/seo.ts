import type { MetaDescriptor } from "react-router";
import { APP_NAME, DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from "@/lib/app-config";

const FALLBACK_SITE_URL = "https://gh-store.me";

export function getSiteUrl(env?: Record<string, string | undefined>): string {
  const configured = env?.APP_URL?.trim() || "";
  return (configured || FALLBACK_SITE_URL).replace(/\/+$/, "");
}

/** Normalize a route path to a leading slash with no trailing slash. */
function normalizePath(path: string): string {
  if (!path || path === "/") {
    return "";
  }
  const withLeadingSlash = path.startsWith("/") ? path : `/${path}`;
  return withLeadingSlash.replace(/\/+$/, "");
}

export function buildLocalePath(locale: Locale, path = ""): string {
  return `/${locale}${normalizePath(path)}`;
}

export function buildAbsoluteUrl(locale: Locale, path = "", siteUrl?: string): string {
  return `${siteUrl ?? FALLBACK_SITE_URL}${buildLocalePath(locale, path)}`;
}

export type PageMetaInput = {
  locale: Locale;
  /** Route path without the locale segment, e.g. `/games`. */
  path?: string;
  title: string;
  description: string;
  imageUrl?: string | null;
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
  title,
  description,
  imageUrl,
  noIndex = false,
  siteUrl = FALLBACK_SITE_URL,
}: PageMetaInput): MetaDescriptor[] {
  const url = buildAbsoluteUrl(locale, path, siteUrl);
  const meta: MetaDescriptor[] = [
    { title },
    { name: "description", content: description },
    { tagName: "link", rel: "canonical", href: url },
    ...SUPPORTED_LOCALES.map((supported) => ({
      tagName: "link" as const,
      rel: "alternate",
      hrefLang: supported,
      href: buildAbsoluteUrl(supported, path, siteUrl),
    })),
    {
      tagName: "link" as const,
      rel: "alternate",
      hrefLang: "x-default",
      href: buildAbsoluteUrl(DEFAULT_LOCALE, path, siteUrl),
    },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: APP_NAME },
    { property: "og:locale", content: locale === "ar" ? "ar_SY" : "en_US" },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:url", content: url },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    {
      name: "twitter:card",
      content: imageUrl ? "summary_large_image" : "summary",
    },
  ];

  if (imageUrl) {
    meta.push(
      { property: "og:image", content: imageUrl },
      { name: "twitter:image", content: imageUrl },
    );
  }

  if (noIndex) {
    meta.push({ name: "robots", content: "noindex, follow" });
  }

  return meta;
}

/** JSON-LD structured data descriptors (Store + WebSite with search action). */
export function buildOrganizationJsonLd(siteUrl: string, name = APP_NAME): Record<string, unknown>[] {
  return [
    {
      "@context": "https://schema.org",
      "@type": "Store",
      name,
      url: siteUrl,
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name,
      url: siteUrl,
      potentialAction: {
        "@type": "SearchAction",
        target: `${siteUrl}/ar/search?q={query}`,
        "query-input": "required name=query",
      },
    },
  ];
}
