import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { toRetailPrice } from "@/lib/catalog/pricing";
import { MaxStoreClient } from "@/providers/maxstore/client";
import { MaxStoreError } from "@/providers/maxstore/errors";
import {
  MAXSTORE_PROVIDER_NAME,
  readCategoryNames,
  readContentCategories,
  readContentProductIds,
  readProductParams,
  readQuantityBounds,
  toMaxStoreGameCode,
  toMaxStoreGameSlug,
  toMaxStoreOfferSlug,
  toOfferType,
} from "@/providers/maxstore/mapping";
import type { MaxStoreProduct } from "@/providers/maxstore/schemas";
import type { Database, Json } from "@/types/database";

/**
 * MaxStore catalogue import.
 *
 * MaxStore models everything it sells as flat products carrying a `category_id`,
 * so each **category becomes one `games` row** and each of its **products
 * becomes an offer** underneath — the same shape the G2Bulk voucher import
 * settled on, because the storefront only renders offers inside a container.
 *
 * `/api/v2/products` is the source of truth here, not `/api/v2/content`. The
 * products endpoint has a documented response and carries the category id on
 * every row; `content` has no documented shape at all, so it is consulted only
 * for prettier category names and its failure costs nothing. That ordering is
 * deliberate: the import must not depend on the one endpoint whose contract is
 * a guess.
 *
 * Idempotency and the preservation rules follow the existing imports exactly.
 * A container is found through `provider_game_mappings` and an offer through
 * `provider_offer_mappings`; names, artwork, and publication are written only
 * when a row is created; a price is refreshed only while the offer is still on
 * default pricing and not on sale. The supplier cost is always refreshed,
 * because it is the provider's number and never the operator's.
 *
 * Nothing here has run against a live token. Every read is written to survive a
 * shape that differs from `docs/providers/maxstore-api.md`, and a category that
 * fails is recorded against itself rather than ending the run.
 */

type Client = SupabaseClient<Database>;

export type MaxStoreImportOptions = {
  publish: boolean;
  markupPercent: number;
};

export type MaxStoreCategoryOutcome = {
  categoryId: string;
  name: string;
  status: "created" | "updated" | "failed";
  offersCreated: number;
  offersUpdated: number;
  offersDeactivated: number;
  error?: string;
};

export type MaxStoreImportSummary = {
  logId: string | null;
  requested: number;
  created: number;
  updated: number;
  failed: number;
  offersCreated: number;
  offersUpdated: number;
  offersDeactivated: number;
  outcomes: MaxStoreCategoryOutcome[];
};

/** One provider category with the products shown inside its tab. */
export type MaxStoreCategoryProduct = MaxStoreProduct & {
  alreadyImported: boolean;
  providerCode: string;
};

export type MaxStoreCategory = {
  id: string;
  title: string;
  productCount: number;
  availableCount: number;
  stockCount: number | null;
  alreadyImported: boolean;
  products: MaxStoreCategoryProduct[];
  providerCode: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function describeError(error: unknown): string {
  if (error instanceof MaxStoreError) {
    return error.message;
  }

  return error instanceof Error ? error.message : "Unknown failure.";
}

function categoryKey(product: MaxStoreProduct): string {
  if (product.categoryId?.trim()) {
    return product.categoryId.trim();
  }

  const title = product.categoryTitle?.trim();

  return title ? `name:${title.toLocaleLowerCase()}` : "uncategorised";
}

/**
 * Everything MaxStore sells, grouped the way the store will hold it.
 *
 * Shared by the picker and the import so the two can never disagree about what
 * a category contains.
 */
export async function loadMaxStoreCatalogue(
  supabase: Client,
  apiToken: string,
): Promise<{ categories: MaxStoreCategory[]; productsByCategory: Map<string, MaxStoreProduct[]> }> {
  const client = new MaxStoreClient({ apiToken });
  let products = await client.listProducts();
  let contentCategories: ReturnType<typeof readContentCategories> = [];
  let names = new Map<string, string>();

  try {
    const content = await client.getContent(0);
    contentCategories = readContentCategories(content);
    names = readCategoryNames(content);
  } catch {
    // `/products` remains a usable fallback when the undocumented content shape changes.
  }

  const categoryIds = contentCategories.map((category) => category.id);

  /* Recover product-to-category links only when the product endpoint omits them. */
  if (products.some((product) => !product.categoryId && !product.categoryTitle) && categoryIds.length > 0) {
    const productCategory = new Map<string, string>();

    for (const categoryId of categoryIds.slice(0, 50)) {
      try {
        for (const productId of readContentProductIds(await client.getContent(categoryId))) {
          productCategory.set(productId, categoryId);
        }
      } catch {
        // A single category's undocumented response must not discard the rest.
      }
    }

    products = products.map((product) => {
      const categoryId = productCategory.get(product.id);

      return categoryId
        ? { ...product, categoryId, categoryTitle: names.get(categoryId) ?? product.categoryTitle }
        : product;
    });
  }

  const categoryIdByTitle = new Map(
    [...names.entries()].map(([id, title]) => [title.trim().toLocaleLowerCase(), id]),
  );
  const normalisedProducts = products.map((product) => {
    if (product.categoryId || !product.categoryTitle) {
      return product;
    }

    const categoryId = categoryIdByTitle.get(product.categoryTitle.trim().toLocaleLowerCase());

    return categoryId ? { ...product, categoryId } : product;
  });
  const productsByCategory = new Map<string, MaxStoreProduct[]>();

  for (const product of normalisedProducts) {
    const id = categoryKey(product);
    const bucket = productsByCategory.get(id) ?? [];

    bucket.push(product);
    productsByCategory.set(id, bucket);
  }

  const { data: mappings } = await supabase
    .from("provider_offer_mappings")
    .select("external_product_id")
    .eq("provider_name", MAXSTORE_PROVIDER_NAME);
  const imported = new Set(
    (mappings ?? [])
      .map((mapping) => mapping.external_product_id)
      .filter((id): id is string => Boolean(id)),
  );
  const definitions = new Map(
    contentCategories.map((category) => [category.id, category]),
  );

  for (const [id, items] of productsByCategory) {
    if (!definitions.has(id)) {
      definitions.set(id, {
        id,
        title:
          names.get(id) ??
          items.find((item) => item.categoryTitle)?.categoryTitle ??
          (id.startsWith("name:") ? id.slice("name:".length) : `Category ${id}`),
        productCount: null,
        availableCount: null,
      });
    }
  }

  const categories: MaxStoreCategory[] = [...definitions.values()]
    .map((definition) => {
      const items = productsByCategory.get(definition.id) ?? [];
      const availableCount = items.filter((item) => item.available).length;
      const stockValues = items
        .map((item) => item.stockCount)
        .filter((count): count is number => count !== null);
      const categoryProducts = items.map((item) => ({
        ...item,
        alreadyImported: imported.has(item.id),
        providerCode: item.id,
      }));

      return {
        id: definition.id,
        title: definition.title,
        productCount: definition.productCount ?? items.length,
        availableCount: definition.availableCount ?? availableCount,
        stockCount: stockValues.length > 0 ? stockValues.reduce((sum, count) => sum + count, 0) : null,
        alreadyImported: categoryProducts.some((product) => product.alreadyImported),
        products: categoryProducts,
        providerCode: toMaxStoreGameCode(definition.id),
      };
    })
    .filter((category) => category.productCount > 0 || category.products.length > 0)
    .sort((first, second) => first.title.localeCompare(second.title));

  return { categories, productsByCategory };
}

async function takenSlugs(supabase: Client): Promise<Set<string>> {
  const { data } = await supabase.from("games").select("slug");

  return new Set((data ?? []).map((row) => row.slug));
}

/** A slug nothing else has claimed. */
function uniqueSlug(base: string, taken: Set<string>): string {
  if (!taken.has(base)) {
    taken.add(base);

    return base;
  }

  for (let suffix = 2; suffix < 100; suffix += 1) {
    const candidate = `${base}-${suffix}`;

    if (!taken.has(candidate)) {
      taken.add(candidate);

      return candidate;
    }
  }

  return `${base}-${Date.now()}`;
}

type OfferCounts = { offersCreated: number; offersUpdated: number; offersDeactivated: number };

async function importCategoryOffers(
  supabase: Client,
  gameId: string,
  products: MaxStoreProduct[],
  options: MaxStoreImportOptions,
  deactivateMissing: boolean,
): Promise<OfferCounts> {
  const counts: OfferCounts = { offersCreated: 0, offersUpdated: 0, offersDeactivated: 0 };

  const { data: targetOffers } = await supabase
    .from("offers")
    .select("id, game_id, slug, is_sale, is_active")
    .eq("game_id", gameId);
  const offers = targetOffers ?? [];
  const productIds = products.map((product) => product.id);
  const { data: productMappings } = await supabase
    .from("provider_offer_mappings")
    .select("offer_id, external_product_id, pricing_mode")
    .eq("provider_name", MAXSTORE_PROVIDER_NAME)
    .in("external_product_id", productIds);
  const mappedOfferIds = (productMappings ?? []).map((mapping) => mapping.offer_id);
  const { data: mappedOffers } = mappedOfferIds.length
    ? await supabase
        .from("offers")
        .select("id, game_id, slug, is_sale, is_active")
        .in("id", mappedOfferIds)
    : { data: [] };
  const offerById = new Map([...(offers ?? []), ...(mappedOffers ?? [])].map((offer) => [offer.id, offer]));
  const byProductId = new Map<
    string,
    { offerId: string; pricingMode: string | null; gameId: string; slug: string; isSale: boolean; isActive: boolean }
  >();

  for (const mapping of productMappings ?? []) {
    const offer = offerById.get(mapping.offer_id);

    if (mapping.external_product_id && offer) {
      byProductId.set(mapping.external_product_id, {
        offerId: mapping.offer_id,
        pricingMode: mapping.pricing_mode,
        gameId: offer.game_id,
        slug: offer.slug,
        isSale: offer.is_sale,
        isActive: offer.is_active,
      });
    }
  }

  const offerSlugs = new Set(offers.map((offer) => offer.slug));
  const seen = new Set<string>();
  const updatedAt = nowIso();

  for (const [index, product] of products.entries()) {
    const price = toRetailPrice({
      supplierCostUsd: product.price,
      markupPercent: options.markupPercent,
    });
    const bounds = readQuantityBounds(product.qtyValues, product.quantityFixed);
    const existing = byProductId.get(product.id);

    seen.add(product.id);

    const metadata: Json = {
      product_type: product.productType,
      quantity_min: bounds.min,
      quantity_max: bounds.max,
      // The customer-facing fields this product needs, as far as they could be
      // read. An empty list means MaxStore will refuse the order rather than the
      // store delivering to nobody.
      params: readProductParams(product.params),
      synced_at: updatedAt,
    };

    if (existing) {
      const refreshPrice = (existing.pricingMode ?? "default") === "default" && !existing.isSale;
      const moved = existing.gameId !== gameId;
      const nextSlug = moved && offerSlugs.has(existing.slug)
        ? uniqueSlug(`${existing.slug}-${product.id}`, offerSlugs)
        : existing.slug;

      if (moved) {
        await supabase
          .from("offers")
          .update({ game_id: gameId, slug: nextSlug, updated_at: updatedAt })
          .eq("id", existing.offerId);
        existing.gameId = gameId;
        existing.slug = nextSlug;
        offerSlugs.add(nextSlug);
      }

      await supabase
        .from("offers")
        .update({
          ...(refreshPrice ? { price } : {}),
          // Availability is the provider's to decide; an operator's own
          // deactivation is not overridden into `true` by a sync.
          ...(product.available ? {} : { is_active: false }),
          updated_at: updatedAt,
        })
        .eq("id", existing.offerId);

      await supabase
        .from("provider_offer_mappings")
        .update({ supplier_cost_usd: product.price, metadata, updated_at: updatedAt })
        .eq("offer_id", existing.offerId)
        .eq("provider_name", MAXSTORE_PROVIDER_NAME);

      if (!product.available && existing.isActive) {
        counts.offersDeactivated += 1;
      } else {
        counts.offersUpdated += 1;
      }

      continue;
    }

    const slug = uniqueSlug(toMaxStoreOfferSlug(product), offerSlugs);
    const { data: created } = await supabase
      .from("offers")
      .insert({
        game_id: gameId,
        slug,
        name_ar: product.name,
        name_en: product.name,
        price,
        offer_type: toOfferType(product.productType),
        sort_order: index,
        // Publishing is the operator's decision, and an unavailable product is
        // never published regardless of it.
        is_active: options.publish && product.available,
      })
      .select("id")
      .maybeSingle();

    if (!created) {
      continue;
    }

    await supabase.from("provider_offer_mappings").insert({
      offer_id: created.id,
      provider_name: MAXSTORE_PROVIDER_NAME,
      external_product_id: product.id,
      supplier_cost_usd: product.price,
      pricing_mode: "default",
      metadata,
    });

    counts.offersCreated += 1;
  }

  /*
   * A product the supplier has stopped listing is deactivated, never deleted.
   * Orders point at it, and an offer that vanishes takes its own history's
   * meaning with it.
   */
  for (const [productId, mapped] of byProductId.entries()) {
    // Only the target category owns absence-based deactivation. Mappings from
    // other categories are loaded above so their products can move here, but
    // importing one category must never turn another category off.
    if (!deactivateMissing || seen.has(productId) || mapped.gameId !== gameId) {
      continue;
    }

    if (mapped.isActive) {
      await supabase.from("offers").update({ is_active: false }).eq("id", mapped.offerId);
      counts.offersDeactivated += 1;
    }
  }

  return counts;
}

async function removeEmptyLegacyUncategorisedContainer(supabase: Client): Promise<void> {
  const { data: mappings } = await supabase
    .from("provider_game_mappings")
    .select("game_id, external_game_code, metadata")
    .eq("provider_name", MAXSTORE_PROVIDER_NAME);
  const candidates = (mappings ?? []).filter((mapping) => {
    if (mapping.external_game_code === "category:uncategorised") {
      return true;
    }

    const metadata = mapping.metadata;

    return (
      metadata &&
      typeof metadata === "object" &&
      !Array.isArray(metadata) &&
      (metadata as Record<string, unknown>).kind === "maxstore_category" &&
      (metadata as Record<string, unknown>).category_id === "uncategorised"
    );
  });

  if (candidates.length === 0) {
    return;
  }

  const gameIds = candidates.map((candidate) => candidate.game_id);
  const { data: offers } = await supabase.from("offers").select("game_id").in("game_id", gameIds);
  const occupied = new Set((offers ?? []).map((offer) => offer.game_id));

  for (const candidate of candidates) {
    if (!occupied.has(candidate.game_id)) {
      await supabase.from("games").delete().eq("id", candidate.game_id);
    }
  }
}

async function importOneCategory(
  supabase: Client,
  category: MaxStoreCategory,
  products: MaxStoreProduct[],
  options: MaxStoreImportOptions,
  deactivateMissing: boolean,
  slugs: Set<string>,
): Promise<MaxStoreCategoryOutcome> {
  const code = toMaxStoreGameCode(category.id);
  const { data: mapping } = await supabase
    .from("provider_game_mappings")
    .select("game_id")
    .eq("provider_name", MAXSTORE_PROVIDER_NAME)
    .eq("external_game_code", code)
    .maybeSingle();

  let gameId = mapping?.game_id ?? null;
  let status: "created" | "updated" = mapping ? "updated" : "created";

  if (!gameId) {
    const { data: game, error } = await supabase
      .from("games")
      .insert({
        slug: uniqueSlug(toMaxStoreGameSlug({ id: category.id, title: category.title }), slugs),
        name_ar: category.title,
        name_en: category.title,
        is_active: options.publish,
      })
      .select("id")
      .maybeSingle();

    if (error || !game) {
      throw new Error(`Creating the category container failed: ${error?.message ?? "no row"}`);
    }

    gameId = game.id;
    status = "created";
  }

  const counts = await importCategoryOffers(supabase, gameId, products, options, deactivateMissing);

  await supabase.from("provider_game_mappings").upsert(
    {
      game_id: gameId,
      provider_name: MAXSTORE_PROVIDER_NAME,
      external_game_code: code,
      metadata: {
        kind: "maxstore_category",
        category_id: category.id,
        category_title: category.title,
        product_count: products.length,
        available_count: products.filter((product) => product.available).length,
        synced_at: nowIso(),
      },
    },
    { onConflict: "game_id,provider_name" },
  );

  return { categoryId: category.id, name: category.title, status, ...counts };
}

/**
 * Import the selected categories.
 *
 * One failing category does not abort the run: its error is recorded against
 * itself and the rest continue, because a single bad category should not cost
 * an operator the whole import.
 */
export async function importMaxStoreCategories(
  supabase: Client,
  apiToken: string,
  categoryIds: string[],
  options: MaxStoreImportOptions,
  startedBy: string,
  productIds: string[] = [],
): Promise<MaxStoreImportSummary> {
  const { categories, productsByCategory } = await loadMaxStoreCatalogue(supabase, apiToken);
  const wantedProducts = new Set(productIds.map((id) => id.trim()).filter(Boolean));
  const wantedCategories = new Set(categoryIds.map((id) => id.trim()).filter(Boolean));
  const selected = categories.filter((category) =>
    wantedProducts.size > 0
      ? category.products.some((product) => wantedProducts.has(product.id))
      : wantedCategories.has(category.id),
  );
  const slugs = await takenSlugs(supabase);

  const { data: log } = await supabase
    .from("provider_sync_logs")
    .insert({
      provider_name: MAXSTORE_PROVIDER_NAME,
      kind: "catalog_import",
      status: "running",
      requested_count: selected.length,
      details: {
        categories: categoryIds,
        products: productIds,
        publish: options.publish,
        markup_percent: options.markupPercent,
      },
      started_by: startedBy,
    })
    .select("id")
    .maybeSingle();

  const outcomes: MaxStoreCategoryOutcome[] = [];

  for (const category of selected) {
    try {
      outcomes.push(
        await importOneCategory(
          supabase,
          category,
          (productsByCategory.get(category.id) ?? []).filter((product) =>
            wantedProducts.size === 0 || wantedProducts.has(product.id),
          ),
          options,
          wantedProducts.size === 0 ||
            (productsByCategory.get(category.id)?.length ?? 0) ===
              (productsByCategory.get(category.id) ?? []).filter((product) => wantedProducts.has(product.id)).length,
          slugs,
        ),
      );
    } catch (error) {
      outcomes.push({
        categoryId: category.id,
        name: category.title,
        status: "failed",
        offersCreated: 0,
        offersUpdated: 0,
        offersDeactivated: 0,
        error: describeError(error),
      });
    }
  }

  const created = outcomes.filter((outcome) => outcome.status === "created").length;
  const updated = outcomes.filter((outcome) => outcome.status === "updated").length;
  await removeEmptyLegacyUncategorisedContainer(supabase);

  const failed = outcomes.filter((outcome) => outcome.status === "failed").length;
  const offersCreated = outcomes.reduce((total, outcome) => total + outcome.offersCreated, 0);
  const offersUpdated = outcomes.reduce((total, outcome) => total + outcome.offersUpdated, 0);
  const offersDeactivated = outcomes.reduce(
    (total, outcome) => total + outcome.offersDeactivated,
    0,
  );

  if (log?.id) {
    await supabase
      .from("provider_sync_logs")
      .update({
        status: failed === 0 ? "succeeded" : failed === selected.length ? "failed" : "partial",
        created_count: created,
        updated_count: updated,
        failed_count: failed,
        finished_at: nowIso(),
        details: { outcomes, offers_created: offersCreated, offers_updated: offersUpdated },
        error_message: outcomes.find((outcome) => outcome.error)?.error ?? null,
      })
      .eq("id", log.id);
  }

  return {
    logId: log?.id ?? null,
    requested: selected.length,
    created,
    updated,
    failed,
    offersCreated,
    offersUpdated,
    offersDeactivated,
    outcomes,
  };
}
