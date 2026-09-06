import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Locale } from "@/i18n/config";
import {
  normalizeOfferInputFields,
  resolveCheckoutFieldKeys,
} from "@/lib/catalog/checkout-fields";
import {
  OFFER_SELECT,
  OFFER_WITH_PRODUCT_SELECT,
  toStoreOffer,
  type OfferRow,
  type StoreOffer,
} from "@/lib/catalog/offer-mapper";
import {
  PRODUCT_SELECT,
  toStoreProduct,
  type ProductRow,
  type StoreProduct,
} from "@/lib/catalog/product-mapper";
export type StoreEnv = {
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
};

const FALLBACK_SUPABASE_URL = "https://njlzgfddfnnqujaodbta.supabase.co";
const FALLBACK_PUBLISHABLE_KEY = "sb_publishable_gtOxP1au24qFXwzVppy0vw_oFWaSIH2";

/**
 * Anonymous Supabase client for public catalog reads. No cookies, no session:
 * `auth: { autoRefreshToken: false, persistSession: false }` so edge loaders
 * pay zero auth overhead for storefront content.
 */
export function createPublicClient(env?: StoreEnv): SupabaseClient {
  return createClient(
    env?.SUPABASE_URL?.trim() || FALLBACK_SUPABASE_URL,
    env?.SUPABASE_PUBLISHABLE_KEY?.trim() || FALLBACK_PUBLISHABLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/**
 * Card-grid columns: PRODUCT_SELECT minus the full descriptions, which cards
 * never render. Descriptions cross the ocean and bloat the RSC/SSR payload for
 * nothing — detail pages fetch them separately.
 */
const PRODUCT_SUMMARY_SELECT = PRODUCT_SELECT.replace(
  ", description_ar, description_en",
  "",
);

const CAROUSEL_LIMIT = 8;
const GRID_LIMIT = 24;

export type HomeData = {
  carousel: StoreProduct[];
  grid: StoreProduct[];
  heroImage: string | null;
};

type PriceRow = { product_id: string; price: number };

/**
 * Homepage content in exactly two parallel PostgREST round trips:
 * carousel slides + active grid, then one offers query for every visible
 * product's cheapest price. The legacy path paid three sequential hops
 * (category id, products, per-grid price fan-out).
 */
export async function getHomeData(
  client: SupabaseClient,
  locale: Locale,
): Promise<HomeData> {
  const [carouselRes, gridRes] = await Promise.all([
    client
      .from("products")
      .select(PRODUCT_SUMMARY_SELECT)
      .eq("is_active", true)
      .eq("show_in_carousel", true)
      .order("carousel_order", { ascending: true, nullsFirst: false })
      .order("sort_order", { ascending: true })
      .limit(CAROUSEL_LIMIT),
    client
      .from("products")
      .select(PRODUCT_SUMMARY_SELECT)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name_en", { ascending: true })
      .limit(GRID_LIMIT),
  ]);

  if (carouselRes.error) throw carouselRes.error;
  if (gridRes.error) throw gridRes.error;

  const carousel = ((carouselRes.data ?? []) as unknown as ProductRow[]).map((row) =>
    toStoreProduct(row, locale),
  );
  const grid = ((gridRes.data ?? []) as unknown as ProductRow[]).map((row) =>
    toStoreProduct(row, locale),
  );

  const ids = [...new Set([...carousel, ...grid].map((p) => p.id))];
  if (ids.length > 0) {
    const { data: prices } = await client
      .from("offers")
      .select("product_id, price")
      .in("product_id", ids)
      .eq("is_active", true);
    const cheapest = new Map<string, number>();
    for (const row of (prices ?? []) as PriceRow[]) {
      const current = cheapest.get(row.product_id);
      if (current === undefined || row.price < current) {
        cheapest.set(row.product_id, row.price);
      }
    }
    for (const product of [...carousel, ...grid]) {
      product.priceFrom = cheapest.get(product.id) ?? null;
    }
  }

  return { carousel, grid, heroImage: carousel[0]?.imageUrl ?? null };
}

export type ProductDetail = {
  product: StoreProduct;
  offers: StoreOffer[];
};

/**
 * Game detail in two sequential reads (offers need the product id), each a
 * single round trip. Returns null when missing, inactive, or filed under a
 * different category — one canonical URL per product, no duplicates.
 */
export async function getProductDetail(
  client: SupabaseClient,
  locale: Locale,
  slug: string,
  categorySlug: string | null,
): Promise<ProductDetail | null> {
  const { data: row, error } = await client
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw error;
  if (!row) return null;

  const typedRow = row as unknown as ProductRow;
  const product = toStoreProduct(typedRow, locale);
  if (categorySlug && product.categorySlug !== categorySlug) return null;

  const { data: offerRows, error: offersError } = await client
    .from("offers")
    .select(OFFER_SELECT)
    .eq("product_id", product.id)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("price", { ascending: true });

  if (offersError) throw offersError;

  const relation = {
    slug: product.slug,
    name_ar: typedRow.name_ar,
    name_en: typedRow.name_en,
    image_url: product.imageUrl,
    logo_url: product.logoUrl,
    points_name_ar: typedRow.points_name_ar,
    points_name_en: typedRow.points_name_en,
    categories: typedRow.categories ?? null,
  };

  return {
    product,
    offers: ((offerRows ?? []) as unknown as OfferRow[]).map((offer) =>
      toStoreOffer({ ...offer, products: relation }, locale),
    ),
  };
}

const PAGE_SIZE = 24;

/** The games category, with active offers supplying each product's starting price. */
export async function getCatalogPage(
  client: SupabaseClient,
  locale: Locale,
  page: number,
): Promise<{ products: StoreProduct[]; total: number; page: number; pageSize: number }> {
  const safePage = Number.isInteger(page) && page > 0 ? page : 1;
  const from = (safePage - 1) * PAGE_SIZE;

  const { data, error, count } = await client
    .from("products")
    .select(PRODUCT_SUMMARY_SELECT.replace("categories!products_category_id_fkey(", "categories!products_category_id_fkey!inner("), { count: "exact" })
    .eq("is_active", true)
    .eq("categories.slug", "games")
    .eq("categories.is_active", true)
    .order("sort_order", { ascending: true })
    .order("name_en", { ascending: true })
    .range(from, from + PAGE_SIZE - 1);

  if (error) throw error;

  const products = ((data ?? []) as unknown as ProductRow[]).map((row) =>
    toStoreProduct(row, locale),
  );

  const ids = products.map((p) => p.id);
  if (ids.length > 0) {
    const { data: prices } = await client
      .from("offers")
      .select("product_id, price")
      .in("product_id", ids)
      .eq("is_active", true);
    const cheapest = new Map<string, number>();
    for (const row of (prices ?? []) as PriceRow[]) {
      const current = cheapest.get(row.product_id);
      if (current === undefined || row.price < current) {
        cheapest.set(row.product_id, row.price);
      }
    }
    for (const product of products) {
      product.priceFrom = cheapest.get(product.id) ?? null;
    }
  }

  return { products, total: count ?? products.length, page: safePage, pageSize: PAGE_SIZE };
}

export type SearchResult = {
  products: StoreProduct[];
  query: string;
};

const SEARCH_LIMIT = 24;

/**
 * Free-text product search across localized names and slugs. Single round
 * trip; the legacy fan-out into offers comes back with the offers index
 * slice, not the search slice.
 */
export async function searchProducts(
  client: SupabaseClient,
  locale: Locale,
  rawQuery: string,
): Promise<SearchResult> {
  const query = rawQuery.trim().slice(0, 80);
  if (!query) return { products: [], query: "" };

  const token = `%${query}%`;
  const { data, error } = await client
    .from("products")
    .select(PRODUCT_SUMMARY_SELECT)
    .eq("is_active", true)
    .or(`name_ar.ilike.${token},name_en.ilike.${token},slug.ilike.${token}`)
    .order("sort_order", { ascending: true })
    .limit(SEARCH_LIMIT);

  if (error) throw error;
  return {
    products: ((data ?? []) as unknown as ProductRow[]).map((row) =>
      toStoreProduct(row, locale),
    ),
    query,
  };
}

/** Active product identities with their canonical category paths. */
export async function getSitemapSlugs(client: SupabaseClient): Promise<{ slug: string; categorySlug: string }[]> {
  const { data, error } = await client
    .from("products")
    .select("slug, categories!inner(slug, is_active)")
    .eq("is_active", true)
    .eq("categories.is_active", true)
    .order("slug", { ascending: true });

  if (error) throw error;
  return (data ?? []).flatMap((row) => {
    const raw = row as unknown as { slug: string; categories: { slug: string } | { slug: string }[] | null };
    const category = Array.isArray(raw.categories) ? raw.categories[0] : raw.categories;
    return category?.slug ? [{ slug: raw.slug, categorySlug: category.slug }] : [];
  });
}

/** Published category landing pages, including categories with no current products. */
export async function getSitemapCategories(client: SupabaseClient): Promise<string[]> {
  const { data, error } = await client.from("categories").select("slug").eq("is_active", true);
  if (error) throw error;
  return (data ?? []).map((row) => row.slug as string);
}

export type InputField = {
  id: string;
  fieldKey: string;
  fieldType: string;
  label: string;
  placeholder: string | null;
  isRequired: boolean;
  options: { value: string; label: string }[];
};

export type OfferDetail = {
  offer: StoreOffer;
  product: StoreProduct;
  inputFields: InputField[];
  relatedOffers: StoreOffer[];
  deliveryKind: "account" | "direct" | "manual" | "stored";
  quantityMax: number | null;
};

/** Loader contract for the checkout page: offer detail plus page chrome. */
export type CheckoutPageData = {
  locale: Locale;
  category: string;
  userId: string;
  idempotencyKey: string;
  offer: StoreOffer;
  product: StoreProduct;
  inputFields: InputField[];
};

function toFieldOptions(options: unknown, locale: Locale): { value: string; label: string }[] {
  if (!Array.isArray(options)) return [];
  return options.flatMap((raw: unknown) => {
    if (!raw || typeof raw !== "object" || !("value" in raw)) return [];
    const value = raw.value;
    if (typeof value !== "string" || !value) return [];
    const labelAr = "label_ar" in raw ? raw.label_ar : undefined;
    const labelEn = "label_en" in raw ? raw.label_en : undefined;
    const picked = locale === "ar" ? labelAr : labelEn;
    return [{ value, label: typeof picked === "string" && picked ? picked : value }];
  });
}

type GameFieldRow = {
  id: string;
  field_key: string;
  field_type: string;
  label_ar: string;
  label_en: string;
  placeholder_ar: string | null;
  placeholder_en: string | null;
  options: unknown;
  is_required: boolean;
};

/**
 * Offer detail: product + its offers, then the offer's checkout fields,
 * delivery kind and provider quantity ceiling in parallel. Mirrors the legacy
 * resolution (offer fields win, else game fields, else none) without the
 * extra product re-read the legacy path paid on the way in.
 */
export async function getOfferDetail(
  client: SupabaseClient,
  locale: Locale,
  categorySlug: string | null,
  gameSlug: string,
  offerSlug: string,
): Promise<OfferDetail | null> {

  const detail = await getProductDetail(client, locale, gameSlug, categorySlug);
  if (!detail) return null;
  const offer = detail.offers.find((candidate) => candidate.slug === offerSlug);
  if (!offer) return null;

  const [fieldsResult, offerRowResult, mappingResult] = await Promise.all([
    client
      .from("game_input_fields")
      .select(
        "id, field_key, field_type, label_ar, label_en, placeholder_ar, placeholder_en, options, is_required",
      )
      .eq("game_id", detail.product.id)
      .order("sort_order", { ascending: true }),
    client.from("offers").select("delivery_kind, input_fields").eq("id", offer.id).maybeSingle(),
    client.from("provider_offer_mappings").select("metadata").eq("offer_id", offer.id).limit(1).maybeSingle(),
  ]);

  if (fieldsResult.error || offerRowResult.error) {
    throw fieldsResult.error ?? offerRowResult.error;
  }

  const OfferStateSchema = z.object({
    delivery_kind: z.unknown().optional(),
    input_fields: z.unknown().optional(),
  });
  const offerState = OfferStateSchema.parse(offerRowResult.data ?? {});
  const deliveryKind =
    offerState.delivery_kind === "direct" ||
    offerState.delivery_kind === "manual" ||
    offerState.delivery_kind === "stored"
      ? offerState.delivery_kind
      : "account";

  const offerFieldDefs = normalizeOfferInputFields(offerState.input_fields);
  const gameRows = ((fieldsResult.data ?? []) as unknown as GameFieldRow[]);
  const resolution = resolveCheckoutFieldKeys(
    { deliveryKind, offerFields: offerFieldDefs },
    { gameFieldKeys: gameRows.map((field) => field.field_key) },
  );

  const isArabic = locale === "ar";
  const gameFields: InputField[] = gameRows.map((field) => ({
    id: field.id,
    fieldKey: field.field_key,
    fieldType: field.field_type,
    label: isArabic ? field.label_ar : field.label_en,
    placeholder: (isArabic ? field.placeholder_ar : field.placeholder_en) ?? null,
    isRequired: field.is_required,
    options: toFieldOptions(field.options, locale),
  }));
  const offerFields: InputField[] = offerFieldDefs.map((field, index) => ({
    id: `offer-${index}`,
    fieldKey: field.field_key,
    fieldType: field.field_type,
    label:
      isArabic
        ? (field.label_ar ?? field.label_en ?? field.field_key)
        : (field.label_en ?? field.label_ar ?? field.field_key),
    placeholder: (isArabic ? field.placeholder_ar : field.placeholder_en) ?? null,
    isRequired: field.is_required !== false,
    options: toFieldOptions(field.options, locale),
  }));

  const MappingSchema = z.object({ metadata: z.unknown().optional() });
  const mapping = MappingSchema.parse(mappingResult.data ?? {});
  const holder = mapping.metadata;
  const rawQuantityMax =
    holder && typeof holder === "object" && !Array.isArray(holder) && "quantity_max" in holder
      ? holder.quantity_max
      : null;

  return {
    offer,
    product: detail.product,
    inputFields:
      resolution.kind === "none" ? [] : resolution.kind === "offer" ? offerFields : gameFields,
    relatedOffers: detail.offers.filter((candidate) => candidate.id !== offer.id),
    deliveryKind,
    quantityMax:
      typeof rawQuantityMax === "number" && Number.isFinite(rawQuantityMax)
        ? Math.floor(rawQuantityMax)
        : null,
  };
}

export type OfferRail = "gift-cards" | "sale";

/**
 * Gift-card or sale rails with parent product attached in one join — the
 * legacy shape (name, price, game link) without the admin cost enrichment,
 * which public renders must never carry.
 */
export async function getOfferRail(
  client: SupabaseClient,
  locale: Locale,
  rail: OfferRail,
  limit = 48,
): Promise<StoreOffer[]> {
  let query = client
    .from("offers")
    .select(OFFER_WITH_PRODUCT_SELECT)
    .eq("is_active", true)
    .eq("products.is_active", true)
    .order("sort_order", { ascending: true })
    .order("price", { ascending: true })
    .limit(limit);

  query =
    rail === "gift-cards"
      ? query.in("offer_type", ["gift_card", "redeem_code"])
      : query.eq("is_sale", true);

  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as unknown as OfferRow[]).map((row) => toStoreOffer(row, locale));
}

export type CategoryPage = {
  categoryName: string | null;
  products: StoreProduct[];
  total: number;
  page: number;
  pageSize: number;
};

/**
 * One category's active products with prices, in two parallel reads: the
 * category row for its localized name, and the joined product page. No
 * category-id pre-lookup round trip — the embed filters in one hop.
 */
export async function getCategoryPage(
  client: SupabaseClient,
  locale: Locale,
  categorySlug: string,
  page: number,
): Promise<CategoryPage | null> {
  const safePage = Number.isInteger(page) && page > 0 ? page : 1;
  const from = (safePage - 1) * PAGE_SIZE;

  const [categoryRes, productsRes] = await Promise.all([
    client
      .from("categories")
      .select("slug, name_ar, name_en")
      .eq("slug", categorySlug)
      .eq("is_active", true)
      .maybeSingle(),
    client
      .from("products")
      .select(PRODUCT_SUMMARY_SELECT.replace("categories!products_category_id_fkey(", "categories!products_category_id_fkey!inner("), { count: "exact" })
      .eq("is_active", true)
      .eq("categories.slug", categorySlug)
      .order("sort_order", { ascending: true })
      .order("name_en", { ascending: true })
      .range(from, from + PAGE_SIZE - 1),
  ]);

  if (categoryRes.error || productsRes.error) {
    throw categoryRes.error ?? productsRes.error;
  }
  if (!categoryRes.data) return null;

  const category = categoryRes.data as unknown as {
    slug: string;
    name_ar: string;
    name_en: string;
  };
  const products = ((productsRes.data ?? []) as unknown as ProductRow[]).map((row) =>
    toStoreProduct(row, locale),
  );

  const ids = products.map((product) => product.id);
  if (ids.length > 0) {
    const { data: prices } = await client
      .from("offers")
      .select("product_id, price")
      .in("product_id", ids)
      .eq("is_active", true);
    const cheapest = new Map<string, number>();
    for (const row of (prices ?? []) as PriceRow[]) {
      const current = cheapest.get(row.product_id);
      if (current === undefined || row.price < current) {
        cheapest.set(row.product_id, row.price);
      }
    }
    for (const product of products) {
      product.priceFrom = cheapest.get(product.id) ?? null;
    }
  }

  return {
    categoryName: locale === "ar" ? category.name_ar : category.name_en,
    products,
    total: productsRes.count ?? products.length,
    page: safePage,
    pageSize: PAGE_SIZE,
  };
}

export type ProductsPage = {
  products: StoreProduct[];
  total: number;
  page: number;
  pageSize: number;
};

/** Every active product, paged — the full catalog behind `/products`. */
export async function getAllProductsPage(
  client: SupabaseClient,
  locale: Locale,
  page: number,
): Promise<ProductsPage> {
  const safePage = Number.isInteger(page) && page > 0 ? page : 1;
  const from = (safePage - 1) * PAGE_SIZE;

  const { data, error, count } = await client
    .from("products")
    .select(PRODUCT_SUMMARY_SELECT, { count: "exact" })
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name_en", { ascending: true })
    .range(from, from + PAGE_SIZE - 1);

  if (error) throw error;

  const products = ((data ?? []) as unknown as ProductRow[]).map((row) =>
    toStoreProduct(row, locale),
  );

  const ids = products.map((product) => product.id);
  if (ids.length > 0) {
    const { data: prices } = await client
      .from("offers")
      .select("product_id, price")
      .in("product_id", ids)
      .eq("is_active", true);
    const cheapest = new Map<string, number>();
    for (const row of (prices ?? []) as PriceRow[]) {
      const current = cheapest.get(row.product_id);
      if (current === undefined || row.price < current) {
        cheapest.set(row.product_id, row.price);
      }
    }
    for (const product of products) {
      product.priceFrom = cheapest.get(product.id) ?? null;
    }
  }

  return { products, total: count ?? products.length, page: safePage, pageSize: PAGE_SIZE };
}
