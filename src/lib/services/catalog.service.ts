import type { Locale } from "@/i18n/config";
import { toStoreGame, type StoreGame } from "@/lib/catalog/game-mapper";
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
