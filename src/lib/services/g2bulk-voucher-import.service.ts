import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { G2BulkClient } from "@/providers/g2bulk/client";
import { classifyStatus, G2BulkContractError, G2BulkError } from "@/providers/g2bulk/errors";
import {
  G2BULK_PROVIDER_NAME,
  resolveProviderImageUrl,
  toRetailPrice,
  toSlug,
} from "@/providers/g2bulk/mapping";
import type {
  ImportGameOutcome,
  ImportOptions,
  ImportSummary,
} from "@/providers/g2bulk/import-types";
import type { G2BulkProduct } from "@/providers/g2bulk/schemas";
import type { Database, Json } from "@/types/database";

/**
 * G2Bulk voucher / gift-card import.
 *
 * The provider models vouchers as flat products grouped by a category
 * (`GET /v1/category`, `GET /v1/products`). The storefront only renders offers
 * inside a game container, so each imported **category becomes one `games` row**
 * and each of its **products becomes a `gift_card` offer** under it.
 *
 * Idempotency mirrors the games import: the container is found through
 * `provider_game_mappings`, and each offer through `provider_offer_mappings`.
 * The container's `external_game_code` is namespaced (`voucher:<categoryId>`) so
 * it can never collide with a real provider game code such as `pubgm`.
 *
 * Re-import preserves the admin's work exactly as the games import does: names,
 * artwork, activation, and ordering are written only when a row is created, and a
 * price is refreshed only while the offer is still on default pricing and not on
 * sale. The supplier cost is always refreshed — it is the provider's number, not
 * the admin's.
 *
 * Stock is load-bearing here in a way it is not for top-ups: a voucher with no
 * stock cannot be delivered, so it is imported (or parked) as inactive.
 */

type Client = SupabaseClient<Database>;

const BASE_URL = "https://api.g2bulk.com/v1";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 400;

/**
 * Namespace for the container game code.
 *
 * `provider_game_mappings` is unique on `(provider_name, external_game_code)`,
 * shared with the top-up lane. A category id of `1` must not be able to claim the
 * mapping of a game whose provider code happens to be `1`.
 */
const VOUCHER_CODE_PREFIX = "voucher:";

/** `GET /v1/category` — public, exactly as documented in `docs/providers/g2bulk-api.md`. */
const categoriesSchema = z.object({
  success: z.literal(true),
  categories: z.array(
    z.object({
      id: z.number(),
      title: z.string().min(1),
      description: z.string().nullish(),
      image_url: z.string().nullish(),
      product_count: z.number().nullish(),
    }),
  ),
});

export type G2BulkVoucherCategory = z.infer<typeof categoriesSchema>["categories"][number];

/** A category together with the products the provider currently lists inside it. */
export type G2BulkVoucherGroup = {
  category: G2BulkVoucherCategory;
  products: G2BulkProduct[];
  /** At least one product the supplier can actually deliver right now. */
  hasStock: boolean;
};

export function toVoucherGameCode(categoryId: number): string {
  return `${VOUCHER_CODE_PREFIX}${categoryId}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nowIso(): string {
  return new Date().toISOString();
}

function messageFrom(json: unknown): string | null {
  if (!json || typeof json !== "object") {
    return null;
  }

  const message = (json as { message?: unknown }).message;

  return typeof message === "string" && message.trim() ? message.trim() : null;
}

function describeError(error: unknown): string {
  if (error instanceof G2BulkError) {
    return `${error.kind}: ${error.message}`;
  }

  return error instanceof Error ? error.message : "Unknown error";
}

/**
 * `GET /v1/category` is documented as public, so it is called **without** the API
 * key: a secret should not be sent where it earns nothing, and a key that leaks
 * into a request that never needed it is pure downside.
 *
 * Retry and backoff follow the adapter's client — bounded attempts on network,
 * 429, and 5xx; an auth failure is never retried, because the provider bans an IP
 * that keeps presenting a bad key.
 */
async function fetchPublicJson(path: string): Promise<unknown> {
  let lastError: G2BulkError | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let response: Response;

    try {
      response = await fetch(`${BASE_URL}${path}`, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        cache: "no-store",
      });
    } catch (error) {
      lastError = new G2BulkError(
        "network",
        error instanceof Error ? error.message : "Network request failed",
      );

      if (attempt === MAX_ATTEMPTS) {
        throw lastError;
      }

      await delay(BACKOFF_BASE_MS * attempt);
      continue;
    }

    const text = await response.text();
    let json: unknown = null;

    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }

    if (response.ok) {
      return json;
    }

    const message = messageFrom(json) ?? `G2Bulk responded ${response.status}`;
    const error = classifyStatus(response.status, message);

    if (!error.retryable || attempt === MAX_ATTEMPTS) {
      throw error;
    }

    lastError = error;
    await delay(BACKOFF_BASE_MS * 2 ** (attempt - 1));
  }

  throw lastError ?? new G2BulkError("network", "G2Bulk request failed");
}

/** Categories from `GET /v1/category`. An unexpected shape is a contract error, never coerced. */
export async function listG2BulkCategories(): Promise<G2BulkVoucherCategory[]> {
  const parsed = categoriesSchema.safeParse(await fetchPublicJson("/category"));

  if (!parsed.success) {
    throw new G2BulkContractError(
      `G2Bulk /category returned an unexpected shape: ${parsed.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.join(".") || "root"} ${issue.message}`)
        .join("; ")}`,
    );
  }

  return parsed.data.categories;
}

function inStock(product: G2BulkProduct): boolean {
  return (product.stock ?? 0) > 0;
}

/**
 * The voucher catalogue, grouped the way it is imported.
 *
 * Both endpoints are public, so no key is involved. A product with no
 * `category_id` is skipped: there is no container to hang it under, and inventing
 * one would put an unlabelled card in the storefront.
 */
export async function loadG2BulkVoucherCatalog(): Promise<G2BulkVoucherGroup[]> {
  const [categories, products] = await Promise.all([
    listG2BulkCategories(),
    new G2BulkClient({ apiKey: null }).listProducts(),
  ]);

  const byCategory = new Map<number, G2BulkProduct[]>();

  for (const product of products) {
    if (typeof product.category_id !== "number") {
      continue;
    }

    const bucket = byCategory.get(product.category_id);

    if (bucket) {
      bucket.push(product);
    } else {
      byCategory.set(product.category_id, [product]);
    }
  }

  return categories.map((category) => {
    const grouped = byCategory.get(category.id) ?? [];

    return {
      category,
      products: grouped,
      hasStock: grouped.some(inStock),
    };
  });
}

/** Make a slug unique against a set of slugs already in use. */
function uniqueSlug(base: string, taken: Set<string>, fallbackSuffix: string): string {
  if (!taken.has(base)) {
    taken.add(base);
    return base;
  }

  const candidate = `${base}-${fallbackSuffix}`;

  if (!taken.has(candidate)) {
    taken.add(candidate);
    return candidate;
  }

  let counter = 2;
  while (taken.has(`${candidate}-${counter}`)) {
    counter += 1;
  }

  const unique = `${candidate}-${counter}`;
  taken.add(unique);

  return unique;
}

/** `metadata` is `Json`, so it has to be narrowed before a key can be read from it. */
function asRecord(metadata: Json | null | undefined): Record<string, Json | undefined> {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
}

/**
 * Whether a row was last hidden by a sync rather than by an admin.
 *
 * Recorded in the mapping metadata so an item that comes back can be reactivated
 * without also republishing something an admin deliberately hid — importing with
 * "publish immediately" off and then re-importing must not quietly go live.
 */
function parkedBySync(metadata: Json | null | undefined): boolean {
  return asRecord(metadata).parked_by_sync === true;
}

async function readGameMapping(
  supabase: Client,
  code: string,
): Promise<{ gameId: string; metadata: Json } | null> {
  const { data, error } = await supabase
    .from("provider_game_mappings")
    .select("game_id, metadata")
    .eq("provider_name", G2BULK_PROVIDER_NAME)
    .eq("external_game_code", code)
    .maybeSingle();

  if (error) {
    throw new Error(`Reading the provider mapping failed: ${error.message}`);
  }

  return data ? { gameId: data.game_id, metadata: data.metadata } : null;
}

async function takenGameSlugs(supabase: Client): Promise<Set<string>> {
  const { data, error } = await supabase.from("products").select("slug");

  if (error) {
    throw new Error(`Reading existing game slugs failed: ${error.message}`);
  }

  return new Set(data.map((row) => row.slug));
}

type OfferCounts = {
  offersCreated: number;
  offersUpdated: number;
  offersDeactivated: number;
};

type ExistingOfferMapping = {
  offerId: string;
  pricingMode: string;
  parked: boolean;
  metadata: Record<string, Json | undefined>;
};

/**
 * Import one category as a container game plus one `gift_card` offer per product.
 */
async function importOneCategory(
  supabase: Client,
  group: G2BulkVoucherGroup,
  options: ImportOptions,
  gameSlugs: Set<string>,
): Promise<ImportGameOutcome> {
  const { category, products } = group;
  const code = toVoucherGameCode(category.id);
  // The category's own artwork is preferred; when the provider leaves it null the
  // first product's image still gives the storefront something to render.
  const imageUrl =
    resolveProviderImageUrl(category.image_url) ??
    resolveProviderImageUrl(products.find((product) => product.image_url)?.image_url);
  const existingMapping = await readGameMapping(supabase, code);
  let gameId = existingMapping?.gameId ?? null;
  const status: ImportGameOutcome["status"] = gameId ? "updated" : "created";

  if (!gameId) {
    const slug = uniqueSlug(
      toSlug(category.title) || `voucher-${category.id}`,
      gameSlugs,
      String(category.id),
    );
    const { data, error } = await supabase
      .from("products")
      .insert({
        slug,
        name_ar: category.title,
        name_en: category.title,
        description_ar: category.description?.trim() || null,
        description_en: category.description?.trim() || null,
        image_url: imageUrl,
        product_kind: "digital",
        // A container with nothing sellable in it is never published, whatever the
        // admin asked for: the storefront would show an empty group.
        is_active: options.publish && group.hasStock,
      })
      .select("id")
      .single();

    if (error) {
      throw new Error(`Creating the voucher group failed: ${error.message}`);
    }

    gameId = data.id;
  }

  const counts = await importVoucherOffers(supabase, gameId, products, options);
  // Only claim the right to reactivate this later if the row would otherwise be
  // live: a group created dormant because the admin declined to publish was not
  // hidden by the sync, and the next run must leave it alone.
  const parkedByThisRun = !group.hasStock && (status === "updated" || options.publish);

  // Reconcile the container itself: nothing in stock means nothing to sell.
  if (!group.hasStock) {
    const { error } = await supabase.from("products").update({ is_active: false }).eq("id", gameId);

    if (error) {
      throw new Error(`Deactivating the empty voucher group failed: ${error.message}`);
    }
  } else if (existingMapping && parkedBySync(existingMapping.metadata)) {
    // It was parked by an earlier run and the provider is stocking it again.
    const { error } = await supabase.from("products").update({ is_active: true }).eq("id", gameId);

    if (error) {
      throw new Error(`Reactivating the voucher group failed: ${error.message}`);
    }
  }

  const { error: mappingError } = await supabase.from("provider_game_mappings").upsert(
    {
      game_id: gameId,
      provider_name: G2BULK_PROVIDER_NAME,
      external_game_code: code,
      metadata: {
        kind: "voucher_category",
        category_id: category.id,
        category_title: category.title,
        provider_image_url: category.image_url ?? null,
        product_count: products.length,
        in_stock_count: products.filter(inStock).length,
        parked_by_sync: parkedByThisRun,
        synced_at: nowIso(),
      },
    },
    { onConflict: "game_id,provider_name" },
  );

  if (mappingError) {
    throw new Error(`Saving the provider mapping failed: ${mappingError.message}`);
  }

  return { code, name: category.title, status, ...counts };
}

async function importVoucherOffers(
  supabase: Client,
  gameId: string,
  products: G2BulkProduct[],
  options: ImportOptions,
): Promise<OfferCounts> {
  const { data: existingOffers, error: offersError } = await supabase
    .from("offers")
    .select("id, slug, is_sale, is_active")
    .eq("product_id", gameId);

  if (offersError) {
    throw new Error(`Reading existing offers failed: ${offersError.message}`);
  }

  const offersById = new Map(existingOffers.map((offer) => [offer.id, offer]));
  const offerIds = existingOffers.map((offer) => offer.id);
  const mappingsByProductId = new Map<string, ExistingOfferMapping>();

  if (offerIds.length > 0) {
    const { data: mappings, error: mappingsError } = await supabase
      .from("provider_offer_mappings")
      .select("offer_id, external_product_id, pricing_mode, metadata")
      .eq("provider_name", G2BULK_PROVIDER_NAME)
      .in("offer_id", offerIds);

    if (mappingsError) {
      throw new Error(`Reading offer mappings failed: ${mappingsError.message}`);
    }

    for (const mapping of mappings) {
      if (mapping.external_product_id) {
        mappingsByProductId.set(mapping.external_product_id, {
          offerId: mapping.offer_id,
          pricingMode: mapping.pricing_mode,
          parked: parkedBySync(mapping.metadata),
          metadata: asRecord(mapping.metadata),
        });
      }
    }
  }

  const offerSlugs = new Set(existingOffers.map((offer) => offer.slug));
  let offersCreated = 0;
  let offersUpdated = 0;
  let offersDeactivated = 0;

  for (const [index, product] of products.entries()) {
    const productId = String(product.id);
    const sellable = inStock(product);
    const price = toRetailPrice({
      supplierCostUsd: product.unit_price,
      markupPercent: options.markupPercent,
    });
    const existing = mappingsByProductId.get(productId);
    const mappingRow = {
      provider_name: G2BULK_PROVIDER_NAME,
      external_product_id: productId,
      supplier_cost_usd: product.unit_price,
      markup_percent: options.markupPercent,
      metadata: {
        product_id: product.id,
        product_title: product.title,
        category_id: product.category_id ?? null,
        face_value: product.face_value ?? null,
        stock: product.stock ?? 0,
        // A card hidden by this run for being out of stock may come back; one an
        // admin hid — or one created dormant on purpose — stays hidden.
        parked_by_sync: !sellable && (existing !== undefined || options.publish),
        synced_at: nowIso(),
      },
    };

    if (existing) {
      const offerRow = offersById.get(existing.offerId);
      // Refresh the retail price only while the offer is still on default pricing
      // and not on sale. A custom price, a fixed price, or a live sale price is an
      // explicit decision, and a catalogue sync must not undo it.
      const mayReprice = existing.pricingMode === "default" && offerRow?.is_sale !== true;
      const offerUpdate: { price?: number; is_active?: boolean } = {};

      if (mayReprice) {
        offerUpdate.price = price;
      }

      if (!sellable && offerRow?.is_active !== false) {
        // Out of stock cannot be sold: the supplier would fail the order.
        offerUpdate.is_active = false;
        offersDeactivated += 1;
      } else if (sellable && offerRow?.is_active === false && existing.parked) {
        offerUpdate.is_active = true;
      }

      if (Object.keys(offerUpdate).length > 0) {
        const { error } = await supabase
          .from("offers")
          .update(offerUpdate)
          .eq("id", existing.offerId);

        if (error) {
          throw new Error(`Updating the offer failed: ${error.message}`);
        }
      }

      const { error: mapError } = await supabase
        .from("provider_offer_mappings")
        .upsert({ offer_id: existing.offerId, ...mappingRow }, { onConflict: "offer_id,provider_name" });

      if (mapError) {
        throw new Error(`Updating the offer mapping failed: ${mapError.message}`);
      }

      offersUpdated += 1;
      continue;
    }

    const slug = uniqueSlug(toSlug(product.title) || `card-${product.id}`, offerSlugs, productId);
    const { data: created, error: createError } = await supabase
      .from("offers")
      .insert({
        product_id: gameId,
        slug,
        offer_type: "gift_card",
        name_ar: product.title,
        name_en: product.title,
        description_ar: product.description?.trim() || null,
        description_en: product.description?.trim() || null,
        price,
        currency: "USD",
        // A card with no stock is imported dormant, never for sale.
        is_active: options.publish && sellable,
        sort_order: index,
        delivery_kind: "direct",
        input_fields: [],
      })
      .select("id")
      .single();

    if (createError) {
      throw new Error(`Creating the offer failed: ${createError.message}`);
    }

    const { error: mapError } = await supabase
      .from("provider_offer_mappings")
      .insert({ offer_id: created.id, pricing_mode: "default", ...mappingRow });

    if (mapError) {
      throw new Error(`Creating the offer mapping failed: ${mapError.message}`);
    }

    offersCreated += 1;
  }

  offersDeactivated += await deactivateWithdrawnOffers(
    supabase,
    mappingsByProductId,
    new Set(products.map((product) => String(product.id))),
  );

  return { offersCreated, offersUpdated, offersDeactivated };
}

/**
 * Park offers the provider no longer lists.
 *
 * Deactivated rather than deleted: orders and invoices reference these rows, and
 * a card that disappears for a week often comes back. What matters is that a
 * customer can no longer buy something the supplier cannot deliver.
 */
async function deactivateWithdrawnOffers(
  supabase: Client,
  mappingsByProductId: Map<string, ExistingOfferMapping>,
  liveProductIds: Set<string>,
): Promise<number> {
  const withdrawn = [...mappingsByProductId.entries()]
    .filter(([productId]) => !liveProductIds.has(productId))
    .map(([, mapping]) => mapping);

  if (withdrawn.length === 0) {
    return 0;
  }

  const { error } = await supabase
    .from("offers")
    .update({ is_active: false })
    .in(
      "id",
      withdrawn.map((mapping) => mapping.offerId),
    );

  if (error) {
    throw new Error(`Deactivating withdrawn offers failed: ${error.message}`);
  }

  // Flagged one by one so the provider detail already in `metadata` survives: the
  // flag is what lets a card that returns be reactivated later.
  for (const mapping of withdrawn) {
    const { error: mapError } = await supabase
      .from("provider_offer_mappings")
      .update({ metadata: { ...mapping.metadata, parked_by_sync: true, withdrawn_at: nowIso() } })
      .eq("offer_id", mapping.offerId)
      .eq("provider_name", G2BULK_PROVIDER_NAME);

    if (mapError) {
      throw new Error(`Marking withdrawn offers failed: ${mapError.message}`);
    }
  }

  return withdrawn.length;
}

/**
 * Import the selected voucher categories.
 *
 * One failing category does not abort the run: its error is recorded against that
 * category and the rest continue, because a single bad group should not cost the
 * admin the whole import.
 */
export async function importG2BulkVouchers(
  supabase: Client,
  categoryIds: number[],
  options: ImportOptions,
  startedBy: string,
): Promise<ImportSummary> {
  const catalog = await loadG2BulkVoucherCatalog();
  const groupsById = new Map(catalog.map((group) => [group.category.id, group]));
  const gameSlugs = await takenGameSlugs(supabase);

  const { data: log } = await supabase
    .from("provider_sync_logs")
    .insert({
      provider_name: G2BULK_PROVIDER_NAME,
      kind: "catalog_import",
      status: "running",
      requested_count: categoryIds.length,
      details: {
        lane: "vouchers",
        category_ids: categoryIds,
        publish: options.publish,
        markup_percent: options.markupPercent,
      },
      started_by: startedBy,
    })
    .select("id")
    .maybeSingle();

  const outcomes: ImportGameOutcome[] = [];

  for (const categoryId of categoryIds) {
    const group = groupsById.get(categoryId);

    if (!group) {
      // The provider stopped listing it between loading the page and submitting.
      outcomes.push({
        code: toVoucherGameCode(categoryId),
        name: String(categoryId),
        status: "failed",
        offersCreated: 0,
        offersUpdated: 0,
        offersDeactivated: 0,
        error: "request: the provider no longer lists this category",
      });
      continue;
    }

    try {
      outcomes.push(await importOneCategory(supabase, group, options, gameSlugs));
    } catch (error) {
      outcomes.push({
        code: toVoucherGameCode(categoryId),
        name: group.category.title,
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
        status: failed === 0 ? "succeeded" : failed === categoryIds.length ? "failed" : "partial",
        created_count: created,
        updated_count: updated,
        failed_count: failed,
        finished_at: nowIso(),
        details: {
          lane: "vouchers",
          category_ids: categoryIds,
          publish: options.publish,
          markup_percent: options.markupPercent,
          offers_created: offersCreated,
          offers_updated: offersUpdated,
          offers_deactivated: offersDeactivated,
          outcomes,
        },
        error_message: outcomes.find((outcome) => outcome.error)?.error ?? null,
      })
      .eq("id", log.id);
  }

  return {
    logId: log?.id ?? null,
    requested: categoryIds.length,
    created,
    updated,
    failed,
    offersCreated,
    offersUpdated,
    offersDeactivated,
    outcomes,
  };
}
