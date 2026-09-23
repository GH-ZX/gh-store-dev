import type { SupabaseClient } from "@supabase/supabase-js";
import type { Locale } from "@/i18n/config";
import { cached } from "@server/lib/cache";
import { PRODUCT_SELECT, toStoreProduct, type ProductRow } from "@/lib/catalog/product-mapper";
import { OFFER_WITH_PRODUCT_SELECT, toStoreOffer, type OfferRow } from "@/lib/catalog/offer-mapper";

async function categories(client: SupabaseClient) {
  const { data, error } = await client.from("categories").select("id, slug, name_ar, name_en")
    .eq("is_active", true).order("sort_order", { ascending: true }).order("slug");
  if (error) throw new Error("Category navigation unavailable");
  return data ?? [];
}
export async function getHeaderCategories(client: SupabaseClient, locale: Locale) {
  try {
    return await cached(`header-categories:${locale}`, 60_000, async () =>
      (await categories(client)).map(row => ({ slug: row.slug as string, name: (locale === "ar" ? row.name_ar : row.name_en) as string })));
  } catch { return undefined; }
}

/** Public clients only. Independent category limits keep a large supplier from hiding other categories. */
export async function getHomeDiscovery(client: SupabaseClient, locale: Locale) {
  try {
    return await cached(`home-discovery:${locale}`, 30_000, async () => {
      const groups = await Promise.all((await categories(client)).slice(0, 16).map(async category => {
        const { data, error } = await client.from("products").select(PRODUCT_SELECT.replace("description_ar, description_en, ", ""))
          .eq("is_active", true).eq("category_id", category.id)
          .order("is_featured", { ascending: false }).order("sort_order").order("id").limit(4);
        return { slug: category.slug as string, name: (locale === "ar" ? category.name_ar : category.name_en) as string,
          products: error ? [] : (data ?? []).map(row => toStoreProduct(row as unknown as ProductRow, locale)) };
      }));
      const populated = groups.filter(group => group.products.length);
      const ids = populated.flatMap(group => group.products.map(product => product.id));
      if (!ids.length) return { groups: [], suggestions: [] };
      const { data, error } = await client.from("offers").select(`product_id, ${OFFER_WITH_PRODUCT_SELECT}`)
        .eq("is_active", true).eq("products.is_active", true).in("product_id", ids).order("price").order("id").limit(2000);
      const offers = error ? [] : data ?? [];
      const pricedGroups = populated.map(group => ({ ...group, products: group.products.map(product => {
        const offer = offers.find(row => row.product_id === product.id);
        return { ...product, priceFrom: offer?.price ?? null };
      }) }));
      // One available product per category, then a second pass if fewer than six categories sell offers.
      const candidates = [0, 1, 2, 3].flatMap(index => pricedGroups.flatMap(group => group.products[index] ? [group.products[index]] : []));
      const suggestions = candidates.flatMap(product => {
        const choices = offers.filter(row => row.product_id === product.id).slice(0, 12).map(row => toStoreOffer(row as unknown as OfferRow, locale));
        return choices.length ? [{ product, offers: choices }] : [];
      }).slice(0, 6);
      return { groups: pricedGroups, suggestions };
    });
  } catch {
    console.warn("Homepage discovery is temporarily unavailable");
    return { groups: [], suggestions: [] };
  }
}
export type HomeDiscovery = Awaited<ReturnType<typeof getHomeDiscovery>>;
