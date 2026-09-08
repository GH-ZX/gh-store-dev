import { isLocale } from "@/i18n/config";
import { getCloudflareContext } from "@/lib/cloudflare-context";
import { createPublicClient } from "@/lib/catalog-queries";
import { searchCatalog } from "@server/lib/services/catalog.service";
import { parseSearchParams } from "@/lib/catalog/search";
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
  const { query, filter } = parseSearchParams(Object.fromEntries(url.searchParams));
  const { env } = getCloudflareContext(context);

  if (!query) {
    return Response.json(
      { products: [], offers: [] },
      { headers: { "Cache-Control": "public, max-age=30" } },
    );
  }

  const { games: products, offers } = await searchCatalog(
    createPublicClient(env),
    locale,
    query,
    filter,
  );
  return Response.json(
    {
      offers: offers
        .slice(0, 5)
        .flatMap((offer) =>
          offer.game
            ? [
                {
                  gameSlug: offer.game.slug,
                  categorySlug: offer.game.categorySlug,
                  offerSlug: offer.slug,
                  name: offer.name,
                },
              ]
            : [],
        ),
      products: products.slice(0, 5).map((product) => ({
        slug: product.slug,
        categorySlug: product.categorySlug,
        name: product.name,
      })),
    },
    { headers: { "Cache-Control": CACHE_CONTROL } },
  );
}
