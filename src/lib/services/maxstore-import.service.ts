import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { toRetailPrice } from "@/lib/catalog/pricing";
import { MaxStoreClient } from "@/providers/maxstore/client";
import { MaxStoreError } from "@/providers/maxstore/errors";
import {
  MAXSTORE_PROVIDER_NAME,
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

/** One category as the picker and the importer both see it. */
export type MaxStoreCategory = {
  id: string;
  title: string;
  productCount: number;
  availableCount: number;
  alreadyImported: boolean;
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

/**
 * Category names out of `/api/v2/content/0`, if they can be found.
 *
 * The response shape is undocumented, so this walks whatever comes back looking
 * for objects that carry an id and something name-shaped, at the top level or
 * one `data` deep. Anything else yields an empty map and the caller falls back
 * to the id — a category called "Category 12" is worse than one called "PUBG",
 * and far better than an import that refuses to run.
 */
export function readCategoryNames(payload: unknown): Map<string, string> {
  const names = new Map<string, string>();
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { data?: unknown })?.data)
      ? ((payload as { data: unknown[] }).data)
      : [];

  for (const row of rows) {
    if (!row || typeof row !== "object") {
      continue;
    }

    const entry = row as { id?: unknown; name?: unknown; title?: unknown };
    const id = entry.id === undefined || entry.id === null ? "" : String(entry.id).trim();
    const name =
      typeof entry.name === "string" && entry.name.trim()
        ? entry.name.trim()
        : typeof entry.title === "string" && entry.title.trim()
          ? entry.title.trim()
          : "";

    if (id && name) {
      names.set(id, name);
    }
  }

  return names;
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
  const products = await client.listProducts();

  // Best-effort, and deliberately not fatal: see `readCategoryNames`.
  let names = new Map<string, string>();

  try {
    names = readCategoryNames(await client.getContent(0));
  } catch {
    names = new Map();
  }

  const productsByCategory = new Map<string, MaxStoreProduct[]>();

  for (const product of products) {
    // A product with no category still has to live somewhere, or it becomes
    // unsellable for a reason nobody can see.
    const categoryId = product.categoryId ?? "uncategorised";
    const bucket = productsByCategory.get(categoryId) ?? [];

    bucket.push(product);
    productsByCategory.set(categoryId, bucket);
  }

  const { data: mappings } = await supabase
    .from("provider_game_mappings")
    .select("external_game_code")
    .eq("provider_name", MAXSTORE_PROVIDER_NAME);

  const imported = new Set((mappings ?? []).map((row) => row.external_game_code));

  const categories: MaxStoreCategory[] = [...productsByCategory.entries()]
    .map(([categoryId, items]) => ({
      id: categoryId,
      title: names.get(categoryId) ?? `Category ${categoryId}`,
      productCount: items.length,
      availableCount: items.filter((item) => item.available).length,
      alreadyImported: imported.has(toMaxStoreGameCode(categoryId)),
      providerCode: toMaxStoreGameCode(categoryId),
    }))
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
): Promise<OfferCounts> {
  const counts: OfferCounts = { offersCreated: 0, offersUpdated: 0, offersDeactivated: 0 };

  const { data: existingOffers } = await supabase
    .from("offers")
    .select("id, slug, is_sale, is_active")
    .eq("game_id", gameId);

  const offers = existingOffers ?? [];
  const offerIds = offers.map((offer) => offer.id);
  const byProductId = new Map<string, { offerId: string; pricingMode: string | null }>();

  if (offerIds.length > 0) {
    const { data: mappings } = await supabase
      .from("provider_offer_mappings")
      .select("offer_id, external_product_id, pricing_mode")
      .eq("provider_name", MAXSTORE_PROVIDER_NAME)
      .in("offer_id", offerIds);

    for (const mapping of mappings ?? []) {
      if (mapping.external_product_id) {
        byProductId.set(mapping.external_product_id, {
          offerId: mapping.offer_id,
          pricingMode: mapping.pricing_mode,
        });
      }
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
      const current = offers.find((offer) => offer.id === existing.offerId);
      const refreshPrice = (existing.pricingMode ?? "default") === "default" && !current?.is_sale;

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

      if (!product.available && current?.is_active) {
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
    if (seen.has(productId)) {
      continue;
    }

    const current = offers.find((offer) => offer.id === mapped.offerId);

    if (current?.is_active) {
      await supabase.from("offers").update({ is_active: false }).eq("id", mapped.offerId);
      counts.offersDeactivated += 1;
    }
  }

  return counts;
}

async function importOneCategory(
  supabase: Client,
  category: MaxStoreCategory,
  products: MaxStoreProduct[],
  options: MaxStoreImportOptions,
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

  const counts = await importCategoryOffers(supabase, gameId, products, options);

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
): Promise<MaxStoreImportSummary> {
  const { categories, productsByCategory } = await loadMaxStoreCatalogue(supabase, apiToken);
  const wanted = new Set(categoryIds.map((id) => id.trim()));
  const selected = categories.filter((category) => wanted.has(category.id));
  const slugs = await takenSlugs(supabase);

  const { data: log } = await supabase
    .from("provider_sync_logs")
    .insert({
      provider_name: MAXSTORE_PROVIDER_NAME,
      kind: "catalog_import",
      status: "running",
      requested_count: selected.length,
      details: { categories: categoryIds, publish: options.publish, markup_percent: options.markupPercent },
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
          productsByCategory.get(category.id) ?? [],
          options,
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
