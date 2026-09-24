import { getDiscoverySettings } from "@server/lib/services/experience-settings.service";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Locale } from "@/i18n/config";
import { cached } from "@server/lib/cache";
import { PRODUCT_SELECT, toStoreProduct, type ProductRow } from "@/lib/catalog/product-mapper";
import { OFFER_WITH_PRODUCT_SELECT, toStoreOffer, type OfferRow } from "@/lib/catalog/offer-mapper";

async function categories(client: SupabaseClient, availableOnly = true, limit?: number) {
  let query = client.from("categories").select(availableOnly
    ? "id, slug, name_ar, name_en, products!products_category_id_fkey!inner(offers!inner(id))"
    : "id, slug, name_ar, name_en").eq("is_active", true);
  if (availableOnly) query = query.eq("products.is_active", true).eq("products.offers.is_active", true).limit(1, { referencedTable: "products" }).limit(1, { referencedTable: "products.offers" });
  if (limit !== undefined) query = query.limit(limit);
  const { data, error } = await query.order("sort_order", { ascending: true }).order("slug");
  if (error) throw new Error("Category navigation unavailable");
  return (data ?? []) as unknown as {id: string; slug: string; name_ar: string; name_en: string}[];
}
export async function getHeaderCategories(client: SupabaseClient, locale: Locale) {
  try {
    return await cached(`header-categories:${locale}`, 30_000, async () =>
      (await categories(client, (await getDiscoverySettings(client)).hide_empty_categories)).map(row => ({ slug: row.slug as string, name: (locale === "ar" ? row.name_ar : row.name_en) as string })));
  } catch { return undefined; }
}

/** Public clients only. Independent category limits keep a large supplier from hiding other categories. */
export async function getHomeDiscovery(
  client: SupabaseClient,
  locale: Locale,
  options: { excludeSlugs?: string[] } = {},
) {
  const excluded = [...new Set(options.excludeSlugs ?? [])].sort();
  try {
    return await cached(`home-discovery:${locale}:${excluded.join(",")}`, 30_000, async () => {
      const settings = await getDiscoverySettings(client);
      const categoryLimit = settings.category_count === 0 && settings.quick_buy_count === 0
        ? 0
        : Math.min(48, Math.max(settings.category_count, settings.quick_buy_count) + excluded.length);
      const groups = await Promise.all((await categories(client, true, categoryLimit)).map(async category => {
        const { data, error } = await client.from("products").select(`${PRODUCT_SELECT.replace("description_ar, description_en, ", "")}, offers!inner(id)`)
          .eq("is_active", true).eq("offers.is_active", true).eq("category_id", category.id)
          .order("is_featured", { ascending: false }).order("sort_order").order("id").limit(settings.products_per_category).limit(1, { referencedTable: "offers" });
        return { slug: category.slug as string, name: (locale === "ar" ? category.name_ar : category.name_en) as string,
          products: error ? [] : (data ?? []).map(row => toStoreProduct(row as unknown as ProductRow, locale)) };
      }));
      const populated = groups.filter(group => group.products.length);
      const ids = populated.flatMap(group => group.products.map(product => product.id));
      if (!ids.length) return { groups: [], suggestions: [] };
      const offerBatches = Array.from({ length: Math.ceil(ids.length / 20) }, (_, index) => ids.slice(index * 20, index * 20 + 20))
        .map(batch => client.from("offers").select(`product_id, ${OFFER_WITH_PRODUCT_SELECT}`)
          .eq("is_active", true).eq("products.is_active", true).in("product_id", batch).order("price").order("id").limit(1000));
      const offerResults = await Promise.all(offerBatches);
      const failedOfferBatch = offerResults.find(result => result.error);
      if (failedOfferBatch) throw new Error("Discovery offers unavailable");
      const offers = offerResults.flatMap(result => result.data ?? []);
      const offersByProduct = new Map<string, OfferRow[]>();
      for (const raw of offers) {
        const row = raw as unknown as OfferRow & { product_id: string };
        const current = offersByProduct.get(row.product_id) ?? [];
        current.push(row);
        offersByProduct.set(row.product_id, current);
      }
      const pricedGroups = populated.map(group => {
        const products = group.products.map(product => {
          const productOffers = offersByProduct.get(product.id) ?? [];
          return { ...product, priceFrom: productOffers[0]?.price ?? null };
        }).filter(product => product.priceFrom !== null);
        return {
          ...group,
          products,
          offers: products.length === 1
            ? (offersByProduct.get(products[0].id) ?? []).slice(0, settings.offers_per_product).map(row => toStoreOffer(row, locale))
            : [],
        };
      }).filter(group => group.products.length);
      const visibleGroups = pricedGroups.filter(group => !excluded.includes(group.slug));
      const candidates = Array.from({ length: settings.products_per_category }, (_, index) => index).flatMap(index => visibleGroups.flatMap(group => group.products[index] ? [group.products[index]] : []));
      const suggestions = candidates.flatMap(product => {
        const choices = (offersByProduct.get(product.id) ?? []).slice(0, settings.offers_per_product).map(row => toStoreOffer(row, locale));
        return choices.length ? [{ product, offers: choices }] : [];
      }).slice(0, settings.quick_buy_count);
      return { groups: visibleGroups.slice(0, settings.category_count), suggestions };
    });
  } catch {
    console.warn("Homepage discovery is temporarily unavailable");
    return { groups: [], suggestions: [] };
  }
}
export type HomeDiscovery = Awaited<ReturnType<typeof getHomeDiscovery>>;
