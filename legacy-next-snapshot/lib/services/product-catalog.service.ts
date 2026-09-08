import type { Locale } from "@/i18n/config";
import { PRODUCT_SELECT, toStoreProduct, type StoreProduct } from "@/lib/catalog/product-mapper";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { CatalogReadError } from "@/lib/services/catalog.service";

export type StoreCategory = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  parentId: string | null;
};

export type ProductCatalog = {
  categories: StoreCategory[];
  products: StoreProduct[];
};

/** Read the generic catalog core; legacy game routes can consume the same ids. */
export async function getProductCatalog(locale: Locale): Promise<ProductCatalog> {
  const supabase = createSupabasePublicClient();
  const [{ data: categories, error: categoriesError }, { data: products, error: productsError }] =
    await Promise.all([
      supabase
        .from("categories")
        .select("id, slug, name_ar, name_en, description_ar, description_en, image_url, parent_id")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("name_en", { ascending: true }),
      supabase
        .from("products")
        .select(PRODUCT_SELECT)
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("name_en", { ascending: true }),
    ]);

  if (categoriesError || productsError) {
    throw new CatalogReadError();
  }

  return {
    categories: categories.map((category) => ({
      id: category.id,
      slug: category.slug,
      name: locale === "ar" ? category.name_ar : category.name_en,
      description: locale === "ar" ? category.description_ar : category.description_en,
      imageUrl: category.image_url,
      parentId: category.parent_id,
    })),
    products: products.map((product) => toStoreProduct(product, locale)),
  };
}

/** Load one category and its active products without imposing a game-only shape. */
export async function getProductsByCategory(
  locale: Locale,
  categorySlug: string,
): Promise<{ category: StoreCategory; products: StoreProduct[] } | null> {
  const catalog = await getProductCatalog(locale);
  const category = catalog.categories.find((item) => item.slug === categorySlug);

  if (!category) {
    return null;
  }

  const supabase = createSupabasePublicClient();
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("category_id", category.id)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name_en", { ascending: true });

  if (error) {
    throw new CatalogReadError();
  }

  return { category, products: data.map((product) => toStoreProduct(product, locale)) };
}
