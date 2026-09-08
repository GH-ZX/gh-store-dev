import { requireAdmin } from "@server/lib/auth/guards";
import { createSupabaseServerClient } from "@server/lib/supabase/server";

export type CatalogReadinessItem = {
  id: string;
  nameAr: string;
  nameEn: string;
  missingOffers: boolean;
  missingArtwork: boolean;
  missingCategory: boolean;
};

export type CatalogReadiness = {
  publishedProducts: number;
  missingOffers: number;
  missingArtwork: number;
  missingCategory: number;
  needsAttention: number;
  items: CatalogReadinessItem[];
};

const PAGE_SIZE = 1000;
const PREVIEW_SIZE = 6;

/** Check published catalog configuration; never turn an incomplete read into zero. */
export async function getCatalogReadiness(): Promise<CatalogReadiness | null> {
  await requireAdmin();

  try {
    const client = await createSupabaseServerClient();
    const [products, offeredProductIds] = await Promise.all([
      (async () => {
        const products: { id: string; name_ar: string; name_en: string; image_url: string | null; category_id: string | null }[] = [];
        for (let offset = 0; ; ) {
          const { data, error } = await client
            .from("products")
            .select("id, name_ar, name_en, image_url, category_id")
            .eq("is_active", true)
            .order("id", { ascending: true })
            .range(offset, offset + PAGE_SIZE - 1);
          if (error || !data) throw new Error("Published products unavailable");
          if (data.length === 0) return products;
          products.push(...data);
          // Advance by what the server returned, including a configured limit
          // smaller than PAGE_SIZE; only an empty page proves completion.
          offset += data.length;
        }
      })(),
      (async () => {
        const ids = new Set<string>();
        for (let offset = 0; ; ) {
          const { data, error } = await client
            .from("offers")
            .select("product_id")
            .eq("is_active", true)
            .order("id", { ascending: true })
            .range(offset, offset + PAGE_SIZE - 1);
          if (error || !data) throw new Error("Active offers unavailable");
          if (data.length === 0) return ids;
          for (const offer of data) if (offer.product_id) ids.add(offer.product_id);
          offset += data.length;
        }
      })(),
    ]);

    const items = products.map((product): CatalogReadinessItem => ({
      id: product.id,
      nameAr: product.name_ar,
      nameEn: product.name_en,
      missingOffers: !offeredProductIds.has(product.id),
      missingArtwork: !product.image_url?.trim(),
      missingCategory: !product.category_id,
    }));
    const unfinished = items.filter((item) => item.missingOffers || item.missingArtwork || item.missingCategory);
    unfinished.sort((a, b) => Number(b.missingOffers) - Number(a.missingOffers) || Number(b.missingCategory) - Number(a.missingCategory) || a.nameEn.localeCompare(b.nameEn));

    return {
      publishedProducts: products.length,
      missingOffers: items.filter((item) => item.missingOffers).length,
      missingArtwork: items.filter((item) => item.missingArtwork).length,
      missingCategory: items.filter((item) => item.missingCategory).length,
      needsAttention: unfinished.length,
      items: unfinished.slice(0, PREVIEW_SIZE),
    };
  } catch {
    return null;
  }
}
