import { NextResponse } from "next/server";
import { isLocale, type Locale } from "@/i18n/config";
import { SEARCH_QUERY_MAX_LENGTH } from "@/lib/catalog/search";
import { searchCatalog } from "@/lib/services/catalog.service";

/**
 * Type-ahead suggestions for the catalog search field.
 *
 * A thin read over the same `searchCatalog` the search page uses, so the
 * dropdown and the results page can never disagree about what exists. It maps
 * the full catalog rows down to the three fields a suggestion needs — a label,
 * a kind, and a destination — so keystroke traffic does not carry artwork URLs,
 * prices, or supplier data the dropdown never shows.
 *
 * Public catalog data, so the response is briefly cacheable at the edge; a
 * one-minute window is far shorter than the catalog changes and long enough to
 * absorb the burst a popular prefix produces. Failures answer empty rather
 * than erroring: the field's own submit still works, so a lost suggestion is a
 * degraded nicety, not a broken search.
 */

export const dynamic = "force-dynamic";

type SuggestPayload = {
  games: { slug: string; categorySlug: string; name: string }[];
  offers: { gameSlug: string; categorySlug: string; offerSlug: string; name: string }[];
};

function json(body: SuggestPayload): NextResponse {
  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const localeParam = url.searchParams.get("locale") ?? "";
  const query = (url.searchParams.get("q") ?? "").trim().slice(0, SEARCH_QUERY_MAX_LENGTH);

  // Two characters is where guessing starts to help rather than spam; shorter
  // prefixes match half the catalog and read as noise.
  if (!isLocale(localeParam) || query.length < 2) {
    return json({ games: [], offers: [] });
  }

  try {
    const { games, offers } = await searchCatalog(localeParam as Locale, query, "all");

    return json({
      games: games.slice(0, 5).map((game) => ({ slug: game.slug, categorySlug: game.categorySlug, name: game.name })),
      offers: offers
        // An offer read without its game join has no destination of its own.
        .filter((offer) => offer.game?.slug)
        .slice(0, 3)
        .map((offer) => ({
          gameSlug: offer.game!.slug,
          categorySlug: offer.game!.categorySlug,
          offerSlug: offer.slug,
          name: offer.name,
        })),
    });
  } catch {
    return json({ games: [], offers: [] });
  }
}
