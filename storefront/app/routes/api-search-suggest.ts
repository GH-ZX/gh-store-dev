import { isLocale } from "@/i18n/config";
import { getCloudflareContext } from "@/lib/cloudflare-context";
import { createPublicClient, searchProducts } from "@/lib/catalog-queries";
import type { Route } from "./+types/api-search-suggest";

const CACHE_CONTROL = "public, s-maxage=60, stale-while-revalidate=300";

/**
 * Type-ahead suggestions for the search field. Debounced client-side; edge
 * cacheable for a minute since catalog names change slowly.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const localeParam = url.searchParams.get("locale") ?? "ar";
  const locale = isLocale(localeParam) ? localeParam : "ar";
  const q = url.searchParams.get("q") ?? "";
  const { env } = getCloudflareContext(context);

  if (!q.trim()) {
    return Response.json(
      { products: [] },
      { headers: { "Cache-Control": "public, max-age=30" } },
    );
  }

  const { products } = await searchProducts(createPublicClient(env), locale, q);
  return Response.json(
    {
      products: products.slice(0, 8).map((product) => ({
        slug: product.slug,
        categorySlug: product.categorySlug,
        name: product.name,
      })),
    },
    { headers: { "Cache-Control": CACHE_CONTROL } },
  );
}
