import { getSiteUrl } from "@/lib/seo";
import { SUPPORTED_LOCALES } from "@/lib/app-config";
import { getCloudflareContext } from "@/lib/cloudflare-context";
import type { Route } from "./+types/robots-txt";

const PRIVATE_PATHS = [
  "profile", "cart", "checkout", "invoice", "dashboard", "orders", "wallet",
  "recharge", "notifications", "support", "telegram-connect",
];

/** Match route boundaries, never arbitrary product names at deeper path levels. */
export const buildRobotsTxt = (siteUrl: string) =>
  [
    "User-Agent: *",
    "Allow: /",
    "Disallow: /api/",
    "Allow: /api/media-proxy?",
    "Disallow: /auth/",
    "# Account and payment routes require authentication and are not catalog pages.",
    ...SUPPORTED_LOCALES.flatMap((locale) =>
      PRIVATE_PATHS.flatMap((path) => [
        `Disallow: /${locale}/${path}$`,
        `Disallow: /${locale}/${path}?`,
        `Disallow: /${locale}/${path}/`,
      ]),
    ),
    "# Search stays crawlable so search engines can read its noindex directive.",
    "",
    `Sitemap: ${getSiteUrl({ APP_URL: siteUrl })}/sitemap.xml`,
    "",
  ].join("\n");

export async function loader({ context }: Route.LoaderArgs) {
  const { env } = getCloudflareContext(context);
  return new Response(buildRobotsTxt(getSiteUrl(env)), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
