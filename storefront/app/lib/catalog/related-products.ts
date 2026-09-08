import type { SupabaseClient } from "@supabase/supabase-js";
import type { Locale } from "@/i18n/config";
import { PRODUCT_SELECT, toStoreProduct, type ProductRow, type StoreProduct } from "@/lib/catalog/product-mapper";
import { UNCATEGORIZED_PRODUCT_PATH } from "@/lib/catalog/paths";

export type RelatedProducts = {
  products: StoreProduct[];
  scope: "category" | "kind" | "catalog";
};

type RelatedRow = ProductRow & { offers?: { price: number; currency: string }[] };
const LIMIT = 4;
const SUMMARY_SELECT = PRODUCT_SELECT.replace(", description_ar, description_en", "");

/** Optional discovery never makes the product itself unavailable. */
export async function getRelatedProducts(
  client: SupabaseClient,
  locale: Locale,
  product: Pick<StoreProduct, "id" | "categorySlug" | "kind">,
): Promise<RelatedProducts> {
  const signal = AbortSignal.timeout(1500);
  async function read(scope: RelatedProducts["scope"]): Promise<StoreProduct[]> {
    const columns = scope === "category"
      ? SUMMARY_SELECT.replace("categories!products_category_id_fkey(", "categories!products_category_id_fkey!inner(")
      : SUMMARY_SELECT;
    let query = client.from("products")
      .select(`${columns}, offers!inner(price, currency)`)
      .eq("is_active", true)
      .eq("offers.is_active", true)
      .neq("id", product.id)
      .order("sort_order", { ascending: true })
      .order("name_en", { ascending: true })
      .order("id", { ascending: true })
      .order("price", { referencedTable: "offers", ascending: true })
      .limit(1, { referencedTable: "offers" })
      .limit(LIMIT)
      .abortSignal(signal);
    if (scope === "category") query = query.eq("categories.slug", product.categorySlug);
    if (scope === "kind") query = query.eq("product_kind", product.kind);
    const { data, error } = await query;
    if (error) throw error;
    return ((data ?? []) as unknown as RelatedRow[]).flatMap((row) => {
      const firstOffer = row.offers?.[0];
      if (!firstOffer) return [];
      const candidate = toStoreProduct(row, locale);
      // Product cards currently format teaser amounts in USD. Other currencies
      // remain available through the product page without a mislabeled teaser.
      if (firstOffer.currency === "USD" && Number.isFinite(firstOffer.price)) {
        candidate.priceFrom = firstOffer.price;
      }
      return [candidate];
    });
  }

  try {
    const scope = product.categorySlug !== UNCATEGORIZED_PRODUCT_PATH
      ? "category"
      : product.kind !== "other" ? "kind" : "catalog";
    const products = await read(scope);
    if (products.length || scope === "catalog") return { products, scope };
    return { products: await read("catalog"), scope: "catalog" };
  } catch {
    return { products: [], scope: "catalog" };
  }
}
