import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { toRetailPrice } from "@/lib/catalog/pricing";
import { BatStoreClient } from "@/providers/batstore/client";
import { BatStoreError } from "@/providers/batstore/errors";
import {
  ACTIVATION_FIELD_KEY,
  BATSTORE_PROVIDER_NAME,
  toBatStoreGameCode,
  toBatStoreGameSlug,
  toBatStoreOfferSlug,
  toOfferType,
} from "@/providers/batstore/mapping";
import type { BatStoreProduct } from "@/providers/batstore/schemas";
import type { Database, Json } from "@/types/database";

/**
 * BatStore catalogue import.
 *
 * BatStore sells flat products — a game top-up, an account, an email, a
 * subscription — each needing an activation identifier (a Telegram ID, an
 * email) to deliver against. There is no provider category to group them by, so
 * **each product becomes its own `games` row** holding **one offer**, and the
 * store category that container lands in is the operator's choice at import
 * time. The container carries a `game_input_fields` row asking the customer for
 * the activation identifier, because every BatStore order needs one.
 *
 * Idempotency and preservation follow the other imports exactly. A container is
 * found through `provider_game_mappings` and an offer through
 * `provider_offer_mappings`; names, artwork, and publication are written only
 * when a row is created; a price is refreshed only while the offer is still on
 * default pricing and not on sale. The supplier cost is always refreshed,
 * because it is the provider's number and never the operator's.
 *
 * Nothing here has run against a live token. Every read is written to survive a
 * shape that differs from `docs/providers/batstore-api.md`, and a product that
 * fails is recorded against itself rather than ending the run.
 */

type Client = SupabaseClient<Database>;

export type BatStoreImportOptions = {
  publish: boolean;
  markupPercent: number;
};

/** One selection from the picker: a product and the store category to put it in. */
export type BatStoreImportSelection = {
  productId: string;
  categoryId: string | null;
};

export type BatStoreProductOutcome = {
  productId: string;
  name: string;
  status: "created" | "updated" | "failed";
  error?: string;
};

export type BatStoreImportSummary = {
  logId: string | null;
  requested: number;
  created: number;
  updated: number;
  failed: number;
  outcomes: BatStoreProductOutcome[];
};

/** One product as the picker and the importer both see it. */
export type BatStoreImportableProduct = {
  id: string;
  name: string;
  priceUsd: number;
  /** Supplier artwork, shown in the picker and used when creating the container. */
  imageUrl: string | null;
  /** A test product, never sold for real money. */
  isTest: boolean;
  /** Whether delivery would work right now: no stock means nothing to deliver. */
  available: boolean;
  alreadyImported: boolean;
  providerCode: string;
  /** The store category the product already sits in, for the picker's select. */
  categoryId: string | null;
};

function nowIso(): string {
  return new Date().toISOString();
}

function describeError(error: unknown): string {
  if (error instanceof BatStoreError) {
    return error.message;
  }

  return error instanceof Error ? error.message : "Unknown failure.";
}

/** Every BatStore product, annotated with what the store already carries. */
export async function loadBatStoreCatalogue(
  supabase: Client,
  apiToken: string,
): Promise<BatStoreImportableProduct[]> {
  const client = new BatStoreClient(apiToken);
  const products = await client.listProducts();

  const { data: mappings } = await supabase
    .from("provider_game_mappings")
    .select("external_game_code, products (category_id)")
    .eq("provider_name", BATSTORE_PROVIDER_NAME);

  const imported = new Map<string, string | null>(
    (mappings ?? [])
      .map((row) => {
        const game = Array.isArray(row.products) ? row.products[0] : row.products;

        return [row.external_game_code, game?.category_id ?? null] as const;
      })
      .filter(([code]) => code !== null),
  );

  return products
    .map((product) => {
      const code = toBatStoreGameCode(product.id);

      return {
        id: product.id,
        name: product.name,
        priceUsd: product.priceUsd,
        imageUrl: product.imageUrl,
        isTest: product.isTest,
        available: (product.stock ?? 0) > 0,
        alreadyImported: imported.has(code),
        categoryId: imported.get(code) ?? null,
        providerCode: code,
      };
    })
    .sort((first, second) => first.name.localeCompare(second.name));
}

async function takenSlugs(supabase: Client): Promise<Set<string>> {
  const { data } = await supabase.from("products").select("slug");

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

/**
 * The activation field a BatStore order needs from the customer.
 *
 * Every BatStore product delivers against an activation identifier — a Telegram
 * ID, a Grok ID, an email. The checkout collects it through `game_input_fields`
 * and fulfilment forwards it to the provider, so the container is created with
 * this one required text field.
 */
async function upsertActivationField(supabase: Client, gameId: string): Promise<void> {
  const { error } = await supabase.from("game_input_fields").upsert(
    {
      game_id: gameId,
      field_key: ACTIVATION_FIELD_KEY,
      field_type: "text",
      label_ar: "معرّف التفعيل",
      label_en: "Activation identifier",
      placeholder_ar: "مثال: معرف تيليغرام، بريد إلكتروني",
      placeholder_en: "For example: a Telegram ID, an email",
      is_required: true,
      sort_order: 0,
    },
    { onConflict: "game_id,field_key" },
  );

  if (error) {
    throw new Error(`Saving the activation field failed: ${error.message}`);
  }
}

async function importOneProduct(
  supabase: Client,
  product: BatStoreProduct,
  selection: BatStoreImportSelection,
  options: BatStoreImportOptions,
  slugs: Set<string>,
): Promise<BatStoreProductOutcome> {
  const code = toBatStoreGameCode(product.id);
  const { data: mapping } = await supabase
    .from("provider_game_mappings")
    .select("game_id")
    .eq("provider_name", BATSTORE_PROVIDER_NAME)
    .eq("external_game_code", code)
    .maybeSingle();

  let gameId = mapping?.game_id ?? null;
  let status: "created" | "updated" = mapping ? "updated" : "created";

  if (!gameId) {
    const { data: game, error } = await supabase
      .from("products")
      .insert({
        slug: uniqueSlug(toBatStoreGameSlug(product), slugs),
        name_ar: product.name,
        name_en: product.name,
        category_id: selection.categoryId,
        ...(product.imageUrl ? { image_url: product.imageUrl } : {}),
        product_kind: "digital",
        is_active: options.publish,
      })
      .select("id")
      .maybeSingle();

    if (error || !game) {
      throw new Error(`Creating the product container failed: ${error?.message ?? "no row"}`);
    }

    gameId = game.id;
    status = "created";
  } else {
    // A re-import re-homes the product under the category the operator just
    // picked; names and artwork stay as the editor left them.
    const { error } = await supabase
      .from("products")
      .update({ category_id: selection.categoryId, updated_at: nowIso() })
      .eq("id", gameId);

    if (error) {
      throw new Error(`Updating the product container failed: ${error.message}`);
    }
  }

  const isDirect = product.deliveryType === "stock";

  // Only account-type products need the activation input field — stock products
  // deliver a code or link directly and ask the buyer nothing.
  if (!isDirect) {
    await upsertActivationField(supabase, gameId);
  }

  const price = toRetailPrice({
    supplierCostUsd: product.priceUsd,
    markupPercent: options.markupPercent,
  });
  const available = (product.stock ?? 0) > 0;

  const { data: existingOffers } = await supabase
    .from("offers")
    .select("id, slug, is_sale, is_active")
    .eq("product_id", gameId);

  const offers = existingOffers ?? [];
  const offerIds = offers.map((offer) => offer.id);
  const byProductId = new Map<string, { offerId: string; pricingMode: string | null }>();

  if (offerIds.length > 0) {
    const { data: mappings } = await supabase
      .from("provider_offer_mappings")
      .select("offer_id, external_product_id, pricing_mode")
      .eq("provider_name", BATSTORE_PROVIDER_NAME)
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

  const existing = byProductId.get(product.id);

  if (existing) {
    const current = offers.find((offer) => offer.id === existing.offerId);
    const refreshPrice = (existing.pricingMode ?? "default") === "default" && !current?.is_sale;

    await supabase
      .from("offers")
      .update({
        ...(refreshPrice ? { price } : {}),
        // No stock means nothing to deliver, so the offer leaves the storefront
        // until the provider restocks — the same rule the voucher import uses.
        ...(available ? {} : { is_active: false }),
        delivery_kind: isDirect ? "direct" : "account",
        updated_at: nowIso(),
      })
      .eq("id", existing.offerId);

    await supabase
      .from("provider_offer_mappings")
      .update({ supplier_cost_usd: product.priceUsd, updated_at: nowIso() })
      .eq("offer_id", existing.offerId)
      .eq("provider_name", BATSTORE_PROVIDER_NAME);

    return { productId: product.id, name: product.name, status };
  }

  const offerSlugs = new Set(offers.map((offer) => offer.slug));
  const slug = uniqueSlug(toBatStoreOfferSlug(product), offerSlugs);
  const { data: created, error: createError } = await supabase
    .from("offers")
    .insert({
      product_id: gameId,
      slug,
      name_ar: product.name,
      name_en: product.name,
      price,
      offer_type: toOfferType(product),
      is_active: options.publish && available,
      delivery_kind: isDirect ? "direct" : "account",
      input_fields: isDirect ? [] : [],
    })
    .select("id")
    .maybeSingle();

  if (createError || !created) {
    throw new Error(`Creating the offer failed: ${createError?.message ?? "no row"}`);
  }

  const metadata: Json = {
    product_id: product.id,
    price_usd: product.priceUsd,
    delivery_type: product.deliveryType,
    is_test: product.isTest,
    synced_at: nowIso(),
  };

  const { error: mapError } = await supabase.from("provider_offer_mappings").insert({
    offer_id: created.id,
    provider_name: BATSTORE_PROVIDER_NAME,
    external_product_id: product.id,
    supplier_cost_usd: product.priceUsd,
    pricing_mode: "default",
    metadata,
  });

  if (mapError) {
    throw new Error(`Saving the offer mapping failed: ${mapError.message}`);
  }

  await supabase.from("provider_game_mappings").upsert(
    {
      game_id: gameId,
      provider_name: BATSTORE_PROVIDER_NAME,
      external_game_code: code,
      metadata: {
        kind: "batstore_product",
        product_id: product.id,
        product_name: product.name,
        synced_at: nowIso(),
      },
    },
    { onConflict: "game_id,provider_name" },
  );

  return { productId: product.id, name: product.name, status: "created" };
}

/**
 * Import the selected products.
 *
 * One failing product does not abort the run: its error is recorded against
 * itself and the rest continue, because a single bad product should not cost an
 * operator the whole import.
 */
export async function importBatStoreProducts(
  supabase: Client,
  apiToken: string,
  selections: BatStoreImportSelection[],
  options: BatStoreImportOptions,
  startedBy: string,
): Promise<BatStoreImportSummary> {
  const client = new BatStoreClient(apiToken);
  const products = await client.listProducts();
  const byId = new Map(products.map((product) => [product.id, product]));
  const slugs = await takenSlugs(supabase);

  const { data: log } = await supabase
    .from("provider_sync_logs")
    .insert({
      provider_name: BATSTORE_PROVIDER_NAME,
      kind: "catalog_import",
      status: "running",
      requested_count: selections.length,
      details: {
        product_ids: selections.map((selection) => selection.productId),
        publish: options.publish,
        markup_percent: options.markupPercent,
      },
      started_by: startedBy,
    })
    .select("id")
    .maybeSingle();

  const outcomes: BatStoreProductOutcome[] = [];

  for (const selection of selections) {
    const product = byId.get(selection.productId);

    if (!product) {
      outcomes.push({
        productId: selection.productId,
        name: selection.productId,
        status: "failed",
        error: "The product is no longer listed by BatStore.",
      });
      continue;
    }

    if (product.isTest) {
      outcomes.push({
        productId: product.id,
        name: product.name,
        status: "failed",
        error: "Test products cannot be sold.",
      });
      continue;
    }

    try {
      outcomes.push(await importOneProduct(supabase, product, selection, options, slugs));
    } catch (error) {
      outcomes.push({
        productId: product.id,
        name: product.name,
        status: "failed",
        error: describeError(error),
      });
    }
  }

  const created = outcomes.filter((outcome) => outcome.status === "created").length;
  const updated = outcomes.filter((outcome) => outcome.status === "updated").length;
  const failed = outcomes.filter((outcome) => outcome.status === "failed").length;

  if (log?.id) {
    await supabase
      .from("provider_sync_logs")
      .update({
        status: failed === 0 ? "succeeded" : failed === selections.length ? "failed" : "partial",
        created_count: created,
        updated_count: updated,
        failed_count: failed,
        finished_at: nowIso(),
        details: { outcomes },
        error_message: outcomes.find((outcome) => outcome.error)?.error ?? null,
      })
      .eq("id", log.id);
  }

  return {
    logId: log?.id ?? null,
    requested: selections.length,
    created,
    updated,
    failed,
    outcomes,
  };
}