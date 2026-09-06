import { isLocale } from "@/i18n/config";
import { getCloudflareContext } from "@/lib/cloudflare-context";
import { createPublicClient } from "@/lib/catalog-queries";
import { searchCatalog } from "@server/lib/services/catalog.service";
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

  const { games: products, offers } = await searchCatalog(
    createPublicClient(env),
    locale,
    q,
    "all",
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
