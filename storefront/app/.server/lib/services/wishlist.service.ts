import type { SupabaseClient } from "@supabase/supabase-js";
import type { Locale } from "@/i18n/config";
import { PRODUCT_SELECT, toStoreProduct, type ProductRow, type StoreProduct } from "@/lib/catalog/product-mapper";

export async function getWishlist(
  supabase: SupabaseClient,
  userId: string,
  locale: Locale,
): Promise<StoreProduct[]> {
  const { data, error } = await (supabase as any)
    .from("wishlist_items")
    .select(`
      product_id,
      created_at,
      products!inner (${PRODUCT_SELECT})
    `)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error || !data) {
    return [];
  }

  return (data as any[]).flatMap((item) => {
    const p = item.products;
    if (!p) return [];
    return [toStoreProduct(p as ProductRow, locale)];
  });
}

export async function getWishlistProductIds(
  supabase: SupabaseClient,
  userId: string,
): Promise<string[]> {
  const { data, error } = await (supabase as any)
    .from("wishlist_items")
    .select("product_id")
    .eq("user_id", userId);

  if (error || !data) {
    return [];
  }

  return (data as any[]).map((r) => r.product_id as string);
}

export async function addToWishlist(
  supabase: SupabaseClient,
  userId: string,
  productId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await (supabase as any).from("wishlist_items").upsert(
    {
      user_id: userId,
      product_id: productId,
    },
    { onConflict: "user_id,product_id" },
  );

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function removeFromWishlist(
  supabase: SupabaseClient,
  userId: string,
  productId: string,
): Promise<{ ok: boolean }> {
  const { error } = await (supabase as any)
    .from("wishlist_items")
    .delete()
    .eq("user_id", userId)
    .eq("product_id", productId);

  return { ok: !error };
}

export async function isProductWishlisted(
  supabase: SupabaseClient,
  userId: string,
  productId: string,
): Promise<boolean> {
  const { data, error } = await (supabase as any)
    .from("wishlist_items")
    .select("id")
    .eq("user_id", userId)
    .eq("product_id", productId)
    .maybeSingle();

  return !error && Boolean(data);
}
