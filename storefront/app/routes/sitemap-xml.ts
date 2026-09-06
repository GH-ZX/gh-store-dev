import { SUPPORTED_LOCALES } from "@/lib/app-config";
import { getCloudflareContext } from "@/lib/cloudflare-context";
import { createPublicClient, getSitemapSlugs } from "@/lib/catalog-queries";
import { buildAbsoluteUrl, getSiteUrl } from "@/lib/seo";
import type { Route } from "./+types/sitemap-xml";

const STATIC_PATHS = [
  "",
  "/games",
  "/gift-cards",
  "/sale",
  "/how",
  "/about",
  "/faq",
  "/contact",
  "/links",
  "/refunds",
  "/privacy",
  "/terms",
];

type Alternate = { hreflang: string; href: string };

function alternatesFor(path: string, siteUrl: string): Alternate[] {
  return SUPPORTED_LOCALES.map((supported) => ({
    hreflang: supported,
    href: buildAbsoluteUrl(supported, path, siteUrl),
  }));
}

function entry(url: string, alternates: Alternate[], changefreq: string, priority: number): string {
  const links = alternates
    .map(
      ({ hreflang, href }) =>
        `    <xhtml:link rel="alternate" hreflang="${hreflang}" href="${href}" />`,
    )
    .join("\n");
  return `  <url>\n    <loc>${url}</loc>\n${links}\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
}

/**
 * Localized XML sitemap with hreflang alternates. A catalog outage degrades
 * to static routes rather than failing the crawl.
 */
export async function loader({ context }: Route.LoaderArgs) {
  const { env } = getCloudflareContext(context);
  const siteUrl = getSiteUrl(env);

  let slugs: string[] = [];
  try {
    slugs = await getSitemapSlugs(createPublicClient(env));
  } catch {
    slugs = [];
  }

  const urls: string[] = [];
  for (const path of STATIC_PATHS) {
    for (const locale of SUPPORTED_LOCALES) {
      urls.push(
        entry(buildAbsoluteUrl(locale, path, siteUrl), alternatesFor(path, siteUrl), "daily", path === "" ? 1 : 0.5),
      );
    }
  }
  for (const slug of slugs) {
    const path = `/games/${slug}`;
    for (const locale of SUPPORTED_LOCALES) {
      urls.push(
        entry(buildAbsoluteUrl(locale, path, siteUrl), alternatesFor(path, siteUrl), "weekly", 0.7),
      );
    }
  }

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
    `${urls.join("\n")}\n</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
