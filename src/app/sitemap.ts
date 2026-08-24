import type { MetadataRoute } from "next";
import { SUPPORTED_LOCALES, type Locale } from "@/i18n/config";
import { buildLocalePath, getSiteUrl } from "@/lib/seo";
import { getActiveGames } from "@/lib/services/catalog.service";

/**
 * Storefront sitemap.
 *
 * Every URL is listed once per locale with `alternates.languages` pointing at its
 * siblings, which is what Google expects for a localized site. Search result
 * pages are excluded deliberately: they are noindex.
 *
 * A catalog read failure degrades to the static routes rather than failing the
 * sitemap — a partial sitemap is far better than a 500 for a crawler.
 */

const STATIC_PATHS = [
  { path: "", priority: 1, changeFrequency: "daily" as const },
  { path: "/games", priority: 0.9, changeFrequency: "daily" as const },
  { path: "/gift-cards", priority: 0.9, changeFrequency: "daily" as const },
  { path: "/sale", priority: 0.8, changeFrequency: "daily" as const },
  { path: "/how", priority: 0.5, changeFrequency: "monthly" as const },
  { path: "/about", priority: 0.5, changeFrequency: "monthly" as const },
  { path: "/faq", priority: 0.5, changeFrequency: "monthly" as const },
  { path: "/contact", priority: 0.4, changeFrequency: "monthly" as const },
  { path: "/links", priority: 0.3, changeFrequency: "monthly" as const },
  { path: "/refunds", priority: 0.3, changeFrequency: "yearly" as const },
  { path: "/privacy", priority: 0.2, changeFrequency: "yearly" as const },
  { path: "/terms", priority: 0.2, changeFrequency: "yearly" as const },
];

function languageAlternates(path: string): Record<string, string> {
  const siteUrl = getSiteUrl();

  return Object.fromEntries(
    SUPPORTED_LOCALES.map((locale) => [locale, `${siteUrl}${buildLocalePath(locale, path)}`]),
  );
}

function entriesForPath(
  path: string,
  priority: number,
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"],
): MetadataRoute.Sitemap {
  const siteUrl = getSiteUrl();
  const languages = languageAlternates(path);

  return SUPPORTED_LOCALES.map((locale) => ({
    url: `${siteUrl}${buildLocalePath(locale, path)}`,
    priority,
    changeFrequency,
    alternates: { languages },
  }));
}

async function gamePaths(): Promise<string[]> {
  try {
    // The default locale read is enough: slugs are shared across locales.
    const games = await getActiveGames(SUPPORTED_LOCALES[0] as Locale);

    return games.map((game) => `/games/${game.slug}`);
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries = STATIC_PATHS.flatMap((entry) =>
    entriesForPath(entry.path, entry.priority, entry.changeFrequency),
  );

  const gameEntries = (await gamePaths()).flatMap((path) => entriesForPath(path, 0.7, "weekly"));

  return [...staticEntries, ...gameEntries];
}
