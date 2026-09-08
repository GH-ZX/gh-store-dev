import type { Metadata } from "next";
import { APP_NAME, DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from "@/lib/config/app";

/**
 * Canonical URLs and language alternates.
 *
 * Every localized page shares one content identity across locales: the canonical
 * URL is the current locale's path, and each locale is listed as an alternate so
 * a crawler serves Arabic to Arabic readers and English to English readers.
 */

const FALLBACK_SITE_URL = "http://localhost:3000";

export function getSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (!configured) {
    return FALLBACK_SITE_URL;
  }

  return configured.replace(/\/+$/, "");
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

export function buildAbsoluteUrl(locale: Locale, path = ""): string {
  return `${getSiteUrl()}${buildLocalePath(locale, path)}`;
}

export function buildAlternates(locale: Locale, path = ""): Metadata["alternates"] {
  const languages: Record<string, string> = {};

  for (const supported of SUPPORTED_LOCALES) {
    languages[supported] = buildLocalePath(supported, path);
  }

  languages["x-default"] = buildLocalePath(DEFAULT_LOCALE, path);

  return {
    canonical: buildLocalePath(locale, path),
    languages,
  };
}

type PageMetadataInput = {
  locale: Locale;
  /** Route path without the locale segment, e.g. `/games`. */
  path?: string;
  title: string;
  description: string;
  imageUrl?: string | null;
  /** Set for pages that must never be indexed, such as search result pages. */
  noIndex?: boolean;
};

export function buildPageMetadata({
  locale,
  path = "",
  title,
  description,
  imageUrl,
  noIndex = false,
}: PageMetadataInput): Metadata {
  const url = buildAbsoluteUrl(locale, path);

  return {
    title,
    description,
    alternates: buildAlternates(locale, path),
    robots: noIndex ? { index: false, follow: true } : undefined,
    openGraph: {
      type: "website",
      siteName: APP_NAME,
      locale: locale === "ar" ? "ar_SY" : "en_US",
      title,
      description,
      url,
      images: imageUrl ? [{ url: imageUrl }] : undefined,
    },
    twitter: {
      card: imageUrl ? "summary_large_image" : "summary",
      title,
      description,
      images: imageUrl ? [imageUrl] : undefined,
    },
  };
}
