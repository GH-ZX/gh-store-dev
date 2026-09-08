import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/seo";

/**
 * Crawl policy.
 *
 * Search result pages and authenticated areas are disallowed: they are either
 * near-duplicate content or private. The API namespace is disallowed because
 * route handlers are for this application, not for indexing.
 */
export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/*/search", "/*/profile", "/*/cart", "/*/checkout", "/*/invoice/"],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
