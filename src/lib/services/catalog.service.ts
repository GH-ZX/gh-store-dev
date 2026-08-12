import type { Locale } from "@/i18n/config";
import { GAME_SELECT, toStoreGame, type StoreGame } from "@/lib/catalog/game-mapper";
import {
  OFFER_SELECT,
  OFFER_WITH_GAME_SELECT,
  toStoreOffer,
  type StoreOffer,
} from "@/lib/catalog/offer-mapper";
import { toSearchTokens, type SearchFilter } from "@/lib/catalog/search";
import { createSupabasePublicClient } from "@/lib/supabase/public";

export class CatalogReadError extends Error {
  constructor() {
    super("Unable to load the catalog.");
    this.name = "CatalogReadError";
  }
}

export type CatalogRead<T> = { ok: true; data: T } | { ok: false };

/**
 * Run a catalog read and hand back the failure as a value.
 *
 * Pages need the failure as data rather than as a caught exception: JSX must not
 * be constructed inside a `try`, because React renders it after the block has
 * exited, so the `catch` would never see a rendering error. Anything that is not
 * a {@link CatalogReadError} is a real defect and keeps propagating to the
 * nearest error boundary.
 */
export async function tryCatalogRead<T>(read: () => Promise<T>): Promise<CatalogRead<T>> {
  try {
    return { ok: true, data: await read() };
  } catch (error) {
    if (error instanceof CatalogReadError) {
      return { ok: false };
    }

    throw error;
  }
}

/** Columns a free-text query is matched against, per entity. */
const GAME_SEARCH_COLUMNS = ["name_ar", "name_en", "slug", "description_ar", "description_en"];
const OFFER_SEARCH_COLUMNS = ["name_ar", "name_en", "slug", "region_code"];

const GIFT_CARD_OFFER_TYPES = ["gift_card", "redeem_code"];

function orIlike(columns: string[], token: string): string {
  return columns.map((column) => `${column}.ilike.%${token}%`).join(",");
}

export async function getActiveGames(locale: Locale, limit?: number): Promise<StoreGame[]> {
  const supabase = createSupabasePublicClient();
  let query = supabase
    .from("games")
    .select(GAME_SELECT)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name_en", { ascending: true });

  if (limit !== undefined) {
    query = query.limit(limit);
  }

  const { data, error } = await query;

  if (error) {
    throw new CatalogReadError();
  }

  return data.map((game) => toStoreGame(game, locale));
}

/** Games an admin flagged for the homepage hero, in the configured order. */
export async function getCarouselGames(locale: Locale, limit: number): Promise<StoreGame[]> {
  const supabase = createSupabasePublicClient();
  const { data, error } = await supabase
    .from("games")
    .select(GAME_SELECT)
    .eq("is_active", true)
    .eq("show_in_carousel", true)
    .order("carousel_order", { ascending: true, nullsFirst: false })
    .order("sort_order", { ascending: true })
    .limit(limit);

  if (error) {
    throw new CatalogReadError();
  }

  return data.map((game) => toStoreGame(game, locale));
}

/**
 * Games picked by id for a custom homepage section.
 *
 * Results follow the admin's id order rather than the database order, and ids
 * that are missing or no longer active are skipped instead of rendering a hole.
 */
export async function getGamesByIds(locale: Locale, ids: string[]): Promise<StoreGame[]> {
  if (ids.length === 0) {
    return [];
  }

  const supabase = createSupabasePublicClient();
  const { data, error } = await supabase
    .from("games")
    .select(GAME_SELECT)
    .eq("is_active", true)
    .in("id", ids);

  if (error) {
    throw new CatalogReadError();
  }

  const byId = new Map(data.map((game) => [game.id, toStoreGame(game, locale)]));

  return ids.map((id) => byId.get(id)).filter((game): game is StoreGame => game !== undefined);
}

export type StoreGameDetail = {
  game: StoreGame;
  offers: StoreOffer[];
};

export async function getGameBySlug(locale: Locale, slug: string): Promise<StoreGameDetail | null> {
  const supabase = createSupabasePublicClient();
  const { data: game, error: gameError } = await supabase
    .from("games")
    .select(GAME_SELECT)
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (gameError) {
    throw new CatalogReadError();
  }

  if (!game) {
    return null;
  }

  const { data: offers, error: offersError } = await supabase
    .from("offers")
    .select(OFFER_SELECT)
    .eq("game_id", game.id)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("price", { ascending: true });

  if (offersError) {
    throw new CatalogReadError();
  }

  // The parent game is already loaded, so attach it instead of re-joining it:
  // offer cards and links need the game slug and name.
  const relation = {
    slug: game.slug,
    name_ar: game.name_ar,
    name_en: game.name_en,
    image_url: game.image_url,
    logo_url: game.logo_url,
  };

  return {
    game: toStoreGame(game, locale),
    offers: offers.map((offer) => toStoreOffer({ ...offer, games: relation }, locale)),
  };
}

export type StoreInputFieldType =
  | "text"
  | "number"
  | "email"
  | "uid"
  | "server"
  | "charname"
  | "select";

export type StoreInputField = {
  id: string;
  fieldKey: string;
  fieldType: StoreInputFieldType;
  label: string;
  placeholder: string | null;
  isRequired: boolean;
  options: { value: string; label: string }[];
};

export type StoreOfferDetail = {
  offer: StoreOffer;
  game: StoreGame;
  inputFields: StoreInputField[];
  relatedOffers: StoreOffer[];
};

type RawInputFieldOption = { value?: unknown; label_ar?: unknown; label_en?: unknown };

function toInputFieldOptions(options: unknown, locale: Locale): { value: string; label: string }[] {
  if (!Array.isArray(options)) {
    return [];
  }

  return options.flatMap((raw) => {
    if (!raw || typeof raw !== "object") {
      return [];
    }

    const option = raw as RawInputFieldOption;
    const value = typeof option.value === "string" ? option.value : null;

    if (!value) {
      return [];
    }

    const localized = locale === "ar" ? option.label_ar : option.label_en;

    return [{ value, label: typeof localized === "string" && localized ? localized : value }];
  });
}

/**
 * One offer with everything its page needs: the parent game, the account fields
 * a customer must provide, and the sibling offers for the same game.
 */
export async function getOfferBySlug(
  locale: Locale,
  gameSlug: string,
  offerSlug: string,
): Promise<StoreOfferDetail | null> {
  const detail = await getGameBySlug(locale, gameSlug);

  if (!detail) {
    return null;
  }

  const offer = detail.offers.find((candidate) => candidate.slug === offerSlug);

  if (!offer) {
    return null;
  }

  const supabase = createSupabasePublicClient();
  const { data: fields, error } = await supabase
    .from("game_input_fields")
    .select(
      "id, field_key, field_type, label_ar, label_en, placeholder_ar, placeholder_en, options, is_required",
    )
    .eq("game_id", detail.game.id)
    .order("sort_order", { ascending: true });

  if (error) {
    throw new CatalogReadError();
  }

  return {
    offer,
    game: detail.game,
    inputFields: fields.map((field) => ({
      id: field.id,
      fieldKey: field.field_key,
      fieldType: field.field_type as StoreInputFieldType,
      label: locale === "ar" ? field.label_ar : field.label_en,
      placeholder: (locale === "ar" ? field.placeholder_ar : field.placeholder_en) ?? null,
      isRequired: field.is_required,
      options: toInputFieldOptions(field.options, locale),
    })),
    relatedOffers: detail.offers.filter((candidate) => candidate.id !== offer.id),
  };
}

export async function getOffersByType(
  locale: Locale,
  offerType: "gift_card" | "redeem_code",
  limit?: number,
): Promise<StoreOffer[]> {
  const supabase = createSupabasePublicClient();
  const types = offerType === "gift_card" ? GIFT_CARD_OFFER_TYPES : [offerType];
  let query = supabase
    .from("offers")
    .select(OFFER_WITH_GAME_SELECT)
    .in("offer_type", types)
    .eq("is_active", true)
    .eq("games.is_active", true)
    .order("sort_order", { ascending: true })
    .order("price", { ascending: true });

  if (limit !== undefined) {
    query = query.limit(limit);
  }

  const { data, error } = await query;

  if (error) {
    throw new CatalogReadError();
  }

  return data.map((offer) => toStoreOffer(offer, locale));
}

export async function getSaleOffers(locale: Locale, limit?: number): Promise<StoreOffer[]> {
  const supabase = createSupabasePublicClient();
  let query = supabase
    .from("offers")
    .select(OFFER_WITH_GAME_SELECT)
    .eq("is_active", true)
    .eq("is_sale", true)
    .eq("games.is_active", true)
    .order("sort_order", { ascending: true })
    .order("price", { ascending: true });

  if (limit !== undefined) {
    query = query.limit(limit);
  }

  const { data, error } = await query;

  if (error) {
    throw new CatalogReadError();
  }

  return data.map((offer) => toStoreOffer(offer, locale));
}

/**
 * Offers to suggest on the homepage.
 *
 * Order history does not exist yet, so this prefers offers from featured games
 * and stays deterministic — a stable list is cacheable, and the ranking becomes
 * real once order data lands in a later stage.
 */
export async function getSuggestedOffers(locale: Locale, limit: number): Promise<StoreOffer[]> {
  const supabase = createSupabasePublicClient();
  const { data, error } = await supabase
    .from("offers")
    .select(OFFER_WITH_GAME_SELECT)
    .eq("is_active", true)
    .eq("games.is_active", true)
    .eq("games.is_featured", true)
    .order("sort_order", { ascending: true })
    .order("price", { ascending: true })
    .limit(limit);

  if (error) {
    throw new CatalogReadError();
  }

  if (data.length > 0) {
    return data.map((offer) => toStoreOffer(offer, locale));
  }

  // Nothing is featured yet; fall back to the cheapest active offers so a fresh
  // catalog still renders a useful section.
  const { data: fallback, error: fallbackError } = await supabase
    .from("offers")
    .select(OFFER_WITH_GAME_SELECT)
    .eq("is_active", true)
    .eq("games.is_active", true)
    .order("price", { ascending: true })
    .limit(limit);

  if (fallbackError) {
    throw new CatalogReadError();
  }

  return fallback.map((offer) => toStoreOffer(offer, locale));
}

export async function getOffersByIds(locale: Locale, ids: string[]): Promise<StoreOffer[]> {
  if (ids.length === 0) {
    return [];
  }

  const supabase = createSupabasePublicClient();
  const { data, error } = await supabase
    .from("offers")
    .select(OFFER_WITH_GAME_SELECT)
    .eq("is_active", true)
    .eq("games.is_active", true)
    .in("id", ids);

  if (error) {
    throw new CatalogReadError();
  }

  const byId = new Map(data.map((offer) => [offer.id, toStoreOffer(offer, locale)]));

  return ids.map((id) => byId.get(id)).filter((offer): offer is StoreOffer => offer !== undefined);
}

export type CatalogSearchResult = {
  games: StoreGame[];
  offers: StoreOffer[];
};

const SEARCH_RESULT_LIMIT = 48;
/** Matched games whose offers are pulled into the offer results. */
const SEARCH_GAME_FANOUT_LIMIT = 20;

/**
 * Game ids that sell at least one active offer of the given types.
 *
 * Used to narrow game results by product kind. PostgREST cannot filter a game by
 * an embedded offer without also shaping the game select, so this stays a
 * separate id lookup: two simple queries beat one query whose result type depends
 * on a runtime-built select string.
 */
async function gameIdsSellingOfferTypes(types: string[]): Promise<Set<string>> {
  const supabase = createSupabasePublicClient();
  const { data, error } = await supabase
    .from("offers")
    .select("game_id")
    .eq("is_active", true)
    .in("offer_type", types);

  if (error) {
    throw new CatalogReadError();
  }

  return new Set(data.map((row) => row.game_id));
}

/**
 * Free-text catalog search.
 *
 * Every token must match, so "pubg uc" narrows rather than widens: tokens are
 * ANDed by chaining `.or(...)`, because PostgREST combines separate `or` filters
 * with AND while keeping the alternatives inside one call ORed.
 *
 * Games are matched first, then offers are matched on their own columns **or** by
 * belonging to a matched game — an offer of a game the visitor searched for is a
 * result even when the offer name itself says nothing about the game. Columns of
 * an embedded resource cannot appear in a top-level `or` group, which is why the
 * game match is expressed as `game_id.in.(…)` instead.
 */
export async function searchCatalog(
  locale: Locale,
  rawQuery: string,
  filter: SearchFilter,
): Promise<CatalogSearchResult> {
  const tokens = toSearchTokens(rawQuery);

  if (tokens.length === 0) {
    return { games: [], offers: [] };
  }

  const supabase = createSupabasePublicClient();
  const wantsGames = filter === "all" || filter === "topup" || filter === "gift_card";
  const wantsOffers = filter === "all" || filter === "offers";

  let gamesQuery = supabase
    .from("games")
    .select(GAME_SELECT)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .limit(SEARCH_RESULT_LIMIT);

  for (const token of tokens) {
    gamesQuery = gamesQuery.or(orIlike(GAME_SEARCH_COLUMNS, token));
  }

  const { data: matchedGameRows, error: gamesError } = await gamesQuery;

  if (gamesError) {
    throw new CatalogReadError();
  }

  let matchedGames = matchedGameRows;

  if (filter === "topup" || filter === "gift_card") {
    const sellingIds = await gameIdsSellingOfferTypes(
      filter === "topup" ? ["topup"] : GIFT_CARD_OFFER_TYPES,
    );
    matchedGames = matchedGames.filter((game) => sellingIds.has(game.id));
  }

  if (!wantsOffers) {
    return { games: matchedGames.map((game) => toStoreGame(game, locale)), offers: [] };
  }

  const matchedGameIds = matchedGameRows.slice(0, SEARCH_GAME_FANOUT_LIMIT).map((game) => game.id);
  const gameIdClause = matchedGameIds.length > 0 ? `,game_id.in.(${matchedGameIds.join(",")})` : "";

  let offersQuery = supabase
    .from("offers")
    .select(OFFER_WITH_GAME_SELECT)
    .eq("is_active", true)
    .eq("games.is_active", true)
    .order("price", { ascending: true })
    .limit(SEARCH_RESULT_LIMIT);

  for (const token of tokens) {
    offersQuery = offersQuery.or(`${orIlike(OFFER_SEARCH_COLUMNS, token)}${gameIdClause}`);
  }

  const { data: offers, error: offersError } = await offersQuery;

  if (offersError) {
    throw new CatalogReadError();
  }

  return {
    games: wantsGames ? matchedGames.map((game) => toStoreGame(game, locale)) : [],
    offers: offers.map((offer) => toStoreOffer(offer, locale)),
  };
}
