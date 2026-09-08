import type { SupabaseClient } from "@supabase/supabase-js";
import type { Locale } from "@/i18n/config";
import { logFailure } from "@server/lib/logging/logger";

export type DiscoveryCategory = {
  id: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  productCount: number;
};

type CategoryRow = {
  id: string;
  slug: string;
  name_ar: string | null;
  name_en: string | null;
  image_url: string | null;
  products: { count: number }[];
};

/** One aggregate read, so counts do not depend on a truncated product list. */
export async function getHomeDiscoveryCategories(
  client: SupabaseClient,
  locale: Locale,
): Promise<DiscoveryCategory[]> {
  try {
    const { data, error } = await client
      .from("categories")
      .select("id,slug,name_ar,name_en,image_url,products!products_category_id_fkey(count)")
      .eq("is_active", true)
      .eq("products.is_active", true)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true })
      .limit(100);
    if (error) throw error;

    return ((data ?? []) as unknown as CategoryRow[])
      .filter((row) => row.slug && Number.isSafeInteger(row.products?.[0]?.count) && row.products[0].count > 0)
      .slice(0, 8)
      .map((row) => ({
        id: row.id,
        slug: row.slug,
        name: (locale === "ar" ? row.name_ar : row.name_en)?.trim()
          || (locale === "ar" ? row.name_en : row.name_ar)?.trim()
          || row.slug,
        imageUrl: row.image_url,
        productCount: row.products[0].count,
      }));
  } catch (error) {
    // Discovery is supplementary. Its failure must not remove the catalog.
    logFailure("home", "category_discovery_unreadable", error);
    return [];
  }
}
