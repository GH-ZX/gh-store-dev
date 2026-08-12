import type { Locale } from "@/i18n/config";
import { toStoreGame, type StoreGame } from "@/lib/catalog/game-mapper";
import { toStoreOffer, type StoreOffer } from "@/lib/catalog/offer-mapper";
import { createSupabasePublicClient } from "@/lib/supabase/public";

export class CatalogReadError extends Error {
  constructor() {
    super("Unable to load the catalog.");
    this.name = "CatalogReadError";
  }
}

export async function getActiveGames(locale: Locale): Promise<StoreGame[]> {
  const supabase = createSupabasePublicClient();
  const { data, error } = await supabase
    .from("games")
    .select(
      "id, slug, name_ar, name_en, description_ar, description_en, points_name_ar, points_name_en, image_url, logo_url, is_featured",
    )
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name_en", { ascending: true });

  if (error) {
    throw new CatalogReadError();
  }

  return data.map((game) => toStoreGame(game, locale));
}

export type StoreGameDetail = {
  game: StoreGame;
  offers: StoreOffer[];
};

export async function getGameBySlug(locale: Locale, slug: string): Promise<StoreGameDetail | null> {
  const supabase = createSupabasePublicClient();
  const { data: game, error: gameError } = await supabase
    .from("games")
    .select(
      "id, slug, name_ar, name_en, description_ar, description_en, points_name_ar, points_name_en, image_url, logo_url, is_featured",
    )
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
    .select(
      "id, slug, name_ar, name_en, description_ar, description_en, price, original_price, currency, is_sale",
    )
    .eq("game_id", game.id)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("price", { ascending: true });

  if (offersError) {
    throw new CatalogReadError();
  }

  return {
    game: toStoreGame(game, locale),
    offers: offers.map((offer) => toStoreOffer(offer, locale)),
  };
}
