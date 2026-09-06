import { getSiteUrl } from "@/lib/seo";
import { getCloudflareContext } from "@/lib/cloudflare-context";
import type { Route } from "./+types/robots-txt";

const BODY = (siteUrl: string) =>
  [
    "User-Agent: *",
    "Allow: /",
    "Disallow: /api/",
    "Disallow: /*/search",
    "Disallow: /*/profile",
    "Disallow: /*/cart",
    "Disallow: /*/checkout",
    "Disallow: /*/invoice/",
    "",
    `Host: ${siteUrl}`,
    `Sitemap: ${siteUrl}/sitemap.xml`,
    "",
  ].join("\n");

export async function loader({ context }: Route.LoaderArgs) {
  const { env } = getCloudflareContext(context);
  return new Response(BODY(getSiteUrl(env)), {
    headers: {
      "Content-Type": "text/plain",
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400",
    },
  });
}
