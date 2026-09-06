import type { SupabaseClient } from "@supabase/supabase-js";
import type { Locale } from "@/i18n/config";
import { PRODUCT_SELECT, toStoreProduct, type ProductRow, type StoreProduct } from "@/lib/catalog/product-mapper";
import { OFFER_WITH_PRODUCT_SELECT, toStoreOffer, type OfferRow, type StoreOffer } from "@/lib/catalog/offer-mapper";
import { cached } from "@server/lib/cache";
import { createSupabaseServiceClient, hasServiceRoleKey } from "@server/lib/supabase/service";

export class CatalogReadError extends Error {
  constructor() { super("Unable to load the catalog."); this.name = "CatalogReadError"; }
}
const GIFT_CARD_OFFER_TYPES = ["gift_card", "redeem_code"];
const BEST_SELLERS_PAD_THRESHOLD = 4;

/** Only aggregate paid orders with service authority; resolve public offers through RLS. */
async function rankedOfferIds(days: number, limit: number): Promise<string[]> {
  return cached(`home-ranking:${days}:${limit}`, 60_000, async () => {
    const { data, error } = await createSupabaseServiceClient()
      .from("order_items")
      .select("offer_id, quantity, orders!inner(payment_status)")
      .eq("orders.payment_status", "paid")
      .gte("created_at", new Date(Date.now() - days * 86400000).toISOString())
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error) throw new CatalogReadError();
    const counts = new Map<string, number>();
    for (const row of data ?? []) {
      if (typeof row.offer_id !== "string") continue;
      const quantity = typeof row.quantity === "number" ? Math.max(1, row.quantity) : 1;
      counts.set(row.offer_id, (counts.get(row.offer_id) ?? 0) + quantity);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id]) => id);
  });
}

export async function getTrendingOffers(supabase: SupabaseClient, locale: Locale, limit: number): Promise<StoreOffer[]> {
  if (!hasServiceRoleKey()) return [];
  const ranked = await rankedOfferIds(30, limit);
  return ranked.length < 4 ? [] : getOffersByIds(supabase, locale, ranked);
}

export async function getActiveProducts(supabase: SupabaseClient, locale: Locale, limit?: number): Promise<StoreProduct[]> {

  const { data: gamesCategory } = await supabase
    .from("categories")
    .select("id")
    .eq("slug", "games")
    .eq("is_active", true)
    .maybeSingle();

  let query = supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name_en", { ascending: true });

  if (gamesCategory) {
    query = query.eq("category_id", gamesCategory.id);
  }

  if (limit !== undefined) {
    query = query.limit(limit);
  }

  const { data, error } = await query;

  if (error) {
    throw new CatalogReadError();
  }

  return attachPriceFrom(supabase, data.map((game) => toStoreProduct(game as unknown as ProductRow, locale)));
}

export async function getProductsByCategories(supabase: SupabaseClient,
  locale: Locale,
  categoryIds: string[],
  limit?: number,
): Promise<StoreProduct[]> {
  if (categoryIds.length === 0) {
    return [];
  }

  let query = supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("is_active", true)
    .in("category_id", categoryIds)
    .order("sort_order", { ascending: true })
    .order("name_en", { ascending: true });

  if (limit !== undefined) {
    query = query.limit(limit);
  }

  const { data, error } = await query;

  if (error) {
    throw new CatalogReadError();
  }

  return attachPriceFrom(supabase, data.map((game) => toStoreProduct(game as unknown as ProductRow, locale)));
}

/**
 * The cheapest active offer per game, for the tile's "from" price line.
 *
 * One small query over active offers rather than a join in every game read: the
 * number is decorative — a teaser, never a charged figure — so a failed read
 * returns the games untouched instead of failing the page.
 */
async function attachPriceFrom(supabase: SupabaseClient, games: StoreProduct[]): Promise<StoreProduct[]> {
  if (games.length === 0) {
    return games;
  }

  const { data, error } = await supabase
    .from("offers")
    .select("product_id, price")
    .eq("is_active", true)
    .in(
      "product_id",
      games.map((game) => game.id),
    );

  if (error || !data) {
    return games;
  }

  const minByGame = new Map<string, number>();

  for (const row of data) {
    if (typeof row.product_id !== "string" || typeof row.price !== "number") {
      continue;
    }

    const current = minByGame.get(row.product_id);

    if (current === undefined || row.price < current) {
      minByGame.set(row.product_id, row.price);
    }
  }

  return games.map((game) =>
    minByGame.has(game.id) ? { ...game, priceFrom: minByGame.get(game.id) } : game,
  );
}


export async function getCarouselProducts(supabase: SupabaseClient, locale: Locale, limit: number): Promise<StoreProduct[]> {
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("is_active", true)
    .eq("show_in_carousel", true)
    .order("carousel_order", { ascending: true, nullsFirst: false })
    .order("sort_order", { ascending: true })
    .limit(limit);

  if (error) {
    throw new CatalogReadError();
  }

  return data.map((game) => toStoreProduct(game as unknown as ProductRow, locale));
}

/**
 * Games picked by id for a custom homepage section.
 *
 * Results follow the admin's id order rather than the database order, and ids
 * that are missing or no longer active are skipped instead of rendering a hole.
 */
export async function getProductsByIds(supabase: SupabaseClient, locale: Locale, ids: string[]): Promise<StoreProduct[]> {
  if (ids.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("is_active", true)
    .in("id", ids);

  if (error) {
    throw new CatalogReadError();
  }

  const byId = new Map(data.map((game) => [game.id, toStoreProduct(game as unknown as ProductRow, locale)]));

  const ordered = ids
    .map((id) => byId.get(id))
    .filter((game): game is StoreProduct => game !== undefined);

  return attachPriceFrom(supabase, ordered);
}


export async function getOffersByType(supabase: SupabaseClient,
  locale: Locale,
  offerType: "gift_card" | "redeem_code",
  limit?: number,
): Promise<StoreOffer[]> {
  const types = offerType === "gift_card" ? GIFT_CARD_OFFER_TYPES : [offerType];
  let query = supabase
    .from("offers")
    .select(OFFER_WITH_PRODUCT_SELECT)
    .in("offer_type", types)
    .eq("is_active", true)
    .eq("products.is_active", true)
    .order("sort_order", { ascending: true })
    .order("price", { ascending: true });

  if (limit !== undefined) {
    query = query.limit(limit);
  }

  const { data, error } = await query;

  if (error) {
    throw new CatalogReadError();
  }

  return data.map((offer) => toStoreOffer(offer as unknown as OfferRow, locale));
}


export async function getSaleOffers(supabase: SupabaseClient, locale: Locale, limit?: number): Promise<StoreOffer[]> {
  let query = supabase
    .from("offers")
    .select(OFFER_WITH_PRODUCT_SELECT)
    .eq("is_active", true)
    .eq("is_sale", true)
    .eq("products.is_active", true)
    .order("sort_order", { ascending: true })
    .order("price", { ascending: true });

  if (limit !== undefined) {
    query = query.limit(limit);
  }

  const { data, error } = await query;

  if (error) {
    throw new CatalogReadError();
  }

  return data.map((offer) => toStoreOffer(offer as unknown as OfferRow, locale));
}


export async function getOffersByIds(supabase: SupabaseClient, locale: Locale, ids: string[]): Promise<StoreOffer[]> {
  if (ids.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("offers")
    .select(OFFER_WITH_PRODUCT_SELECT)
    .eq("is_active", true)
    .eq("products.is_active", true)
    .in("id", ids);

  if (error) {
    throw new CatalogReadError();
  }

  const byId = new Map(data.map((offer) => [offer.id, toStoreOffer(offer as unknown as OfferRow, locale)]));

  const matched = ids
    .map((id) => byId.get(id))
    .filter((offer): offer is StoreOffer => offer !== undefined);

  return matched;
}


async function getRandomActiveOffers(supabase: SupabaseClient, locale: Locale, limit: number): Promise<StoreOffer[]> {
  const { data, error } = await supabase
    .from("offers")
    .select(OFFER_WITH_PRODUCT_SELECT)
    .eq("is_active", true)
    .eq("products.is_active", true)
    .limit(200);

  if (error || !data) {
    throw new CatalogReadError();
  }

  const offers = data.map((offer) => toStoreOffer(offer as unknown as OfferRow, locale));
  const pool = [...offers];

  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  return pool.slice(0, limit);
}


export async function getBestSellers(supabase: SupabaseClient, locale: Locale, limit: number): Promise<StoreOffer[]> {
  const ranked = hasServiceRoleKey() ? await rankedOfferIds(7, limit) : [];

  if (ranked.length === 0) {
    return getRandomActiveOffers(supabase, locale, limit);
  }

  const offers = await getOffersByIds(supabase, locale, ranked);
  const rank = new Map(ranked.map((id, index) => [id, index]));
  const best = offers.sort(
    (first, second) => (rank.get(first.id) ?? ranked.length) - (rank.get(second.id) ?? ranked.length),
  );

  if (best.length >= BEST_SELLERS_PAD_THRESHOLD) {
    return best;
  }

  const realIds = new Set(best.map((offer) => offer.id));
  const pad = (await getRandomActiveOffers(supabase, locale, limit)).filter((offer) => !realIds.has(offer.id));
  const fill = pad.slice(0, limit - best.length);

  return [...best, ...fill];
}


export type OfferCatalogPage = {
  offers: StoreOffer[];
  total: number;
  page: number;
  pageSize: number;
};

/** Paginated offer collections; preserve access to the entire active collection. */
export async function getOfferRailPage(
  supabase: SupabaseClient,
  locale: Locale,
  rail: "gift-cards" | "sale" | "best-sellers",
  page: number,
): Promise<OfferCatalogPage> {
  const safePage = Number.isInteger(page) && page > 0 ? page : 1;
  const pageSize = 12;
  const from = (safePage - 1) * pageSize;
  if (rail === "best-sellers" && hasServiceRoleKey()) {
    const ranked = await rankedOfferIds(7, 96);
    if (ranked.length > 0) {
      const offers = await getOffersByIds(supabase, locale, ranked);
      return { offers: offers.slice(from, from + pageSize), total: offers.length, page: safePage, pageSize };
    }
  }
  let query = supabase.from("offers")
    .select(OFFER_WITH_PRODUCT_SELECT, { count: "exact" })
    .eq("is_active", true)
    .eq("products.is_active", true);
  if (rail === "gift-cards") query = query.in("offer_type", GIFT_CARD_OFFER_TYPES);
  if (rail === "sale") query = query.eq("is_sale", true);
  query = rail === "best-sellers"
    ? query.order("created_at", { ascending: false })
    : query.order("sort_order", { ascending: true }).order("price", { ascending: true });
  const { data, error, count } = await query.range(from, from + pageSize - 1);
  if (error) throw new CatalogReadError();
  const offers = data.map((row) => toStoreOffer(row as unknown as OfferRow, locale));
  return { offers, total: count ?? offers.length, page: safePage, pageSize };
}

export function getBestSellersPage(supabase: SupabaseClient, locale: Locale, page: number): Promise<OfferCatalogPage> {
  return getOfferRailPage(supabase, locale, "best-sellers", page);
}
