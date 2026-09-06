import type { SupabaseClient } from "@supabase/supabase-js";
import type { Locale } from "@/i18n/config";
import { PRODUCT_SELECT, toStoreProduct, type ProductRow, type StoreProduct } from "@/lib/catalog/product-mapper";
import { OFFER_WITH_PRODUCT_SELECT, toStoreOffer, type OfferRow, type StoreOffer } from "@/lib/catalog/offer-mapper";
import { toSearchTokens, type SearchFilter } from "@/lib/catalog/search";
import { CatalogReadError } from "@server/lib/services/home-catalog.service";

const PRODUCT_SEARCH_COLUMNS = ["name_ar", "name_en", "slug", "description_ar", "description_en"];
const OFFER_SEARCH_COLUMNS = ["name_ar", "name_en", "slug", "region_code"];
const GIFT_CARD_OFFER_TYPES = ["gift_card", "redeem_code"];
function orIlike(columns: string[], token: string): string {
  return columns.map((column) => `${column}.ilike.%${token}%`).join(",");
}

export type CatalogSearchResult = {
  games: StoreProduct[];
  offers: StoreOffer[];
};

const SEARCH_RESULT_LIMIT = 48;
/** Matched products whose offers are pulled into the offer results. */
const SEARCH_PRODUCT_FANOUT_LIMIT = 20;

/**
 * Product ids that sell at least one active offer of the given types.
 *
 * Used to narrow product results by product kind. PostgREST cannot filter a product by
 * an embedded offer without also shaping the game select, so this stays a
 * separate id lookup: two simple queries beat one query whose result type depends
 * on a runtime-built select string.
 */
async function productIdsSellingOfferTypes(supabase: SupabaseClient, types: string[]): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("offers")
    .select("product_id")
    .eq("is_active", true)
    .in("offer_type", types);

  if (error) {
    throw new CatalogReadError();
  }

  // Product-only offers (no game) cannot narrow a product search.
  return new Set(data.flatMap((row) => (row.product_id ? [row.product_id] : [])));
}

/**
 * Free-text catalog search.
 *
 * Every token must match, so "pubg uc" narrows rather than widens: tokens are
 * ANDed by chaining `.or(...)`, because PostgREST combines separate `or` filters
 * with AND while keeping the alternatives inside one call ORed.
 *
 * Products are matched first, then offers are matched on their own columns **or** by
 * belonging to a matched product — an offer of a product the visitor searched for is a
 * result even when the offer name itself says nothing about the game. Columns of
 * an embedded resource cannot appear in a top-level `or` group, which is why the
 * product match is expressed as `product_id.in.(…)` instead.
 */
export async function searchCatalog(
  supabase: SupabaseClient,
  locale: Locale,
  rawQuery: string,
  filter: SearchFilter,
): Promise<CatalogSearchResult> {
  const tokens = toSearchTokens(rawQuery);

  if (tokens.length === 0) {
    return { games: [], offers: [] };
  }

  const wantsProducts = filter === "all" || filter === "topup" || filter === "gift_card";
  const wantsOffers = filter === "all" || filter === "offers";

  let productsQuery = supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .limit(SEARCH_RESULT_LIMIT);

  for (const token of tokens) {
    productsQuery = productsQuery.or(orIlike(PRODUCT_SEARCH_COLUMNS, token));
  }

  const { data: matchedProductRows, error: productsError } = await productsQuery;

  if (productsError) {
    throw new CatalogReadError();
  }

  let matchedProducts = matchedProductRows;

  if (filter === "topup" || filter === "gift_card") {
    const sellingIds = await productIdsSellingOfferTypes(
      supabase,
      filter === "topup" ? ["topup"] : GIFT_CARD_OFFER_TYPES,
    );
    matchedProducts = matchedProducts.filter((product) => sellingIds.has(product.id));
  }

  if (!wantsOffers) {
    return { games: matchedProducts.map((product) => toStoreProduct(product as unknown as ProductRow, locale)), offers: [] };
  }

  const matchedProductIds = matchedProductRows.slice(0, SEARCH_PRODUCT_FANOUT_LIMIT).map((product) => product.id);
  const productIdClause = matchedProductIds.length > 0 ? `,product_id.in.(${matchedProductIds.join(",")})` : "";

  let offersQuery = supabase
    .from("offers")
    .select(OFFER_WITH_PRODUCT_SELECT)
    .eq("is_active", true)
    .eq("products.is_active", true)
    .order("price", { ascending: true })
    .limit(SEARCH_RESULT_LIMIT);

  for (const token of tokens) {
    offersQuery = offersQuery.or(`${orIlike(OFFER_SEARCH_COLUMNS, token)}${productIdClause}`);
  }

  const { data: offers, error: offersError } = await offersQuery;

  if (offersError) {
    throw new CatalogReadError();
  }

  return {
    games: wantsProducts ? matchedProducts.map((product) => toStoreProduct(product as unknown as ProductRow, locale)) : [],
    offers: offers.map((offer) => toStoreOffer(offer as unknown as OfferRow, locale)),
  };
}
