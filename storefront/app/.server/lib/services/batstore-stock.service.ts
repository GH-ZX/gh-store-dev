import type { SupabaseClient } from "@supabase/supabase-js";
import { BATSTORE_PROVIDER_NAME } from "@server/providers/batstore/mapping";
import { BatStoreClient } from "@server/providers/batstore/client";
import { readBatStoreCredentials } from "@server/lib/settings/batstore-settings";
import { enqueueTelegramAlert } from "@server/lib/services/telegram-alerts.service";
import { createSupabaseServiceClient } from "@server/lib/supabase/service";
import { log, logFailure } from "@server/lib/logging/logger";
import type { Database, Json } from "@server/types/database";

/**
 * BatStore stock: the snapshot reader and the checkout preflight guard.
 *
 * BatStore is a Telegram-bot reseller whose stock is dynamic, and its catalogue
 * is the only place that number lives — there is no per-product stock route, so
 * reading stock means reading the whole product list once.
 *
 * Two consumers share this module:
 *
 * - the throttled stock sweep (`batstore-stock-sync.service.ts`), which parks
 *   zero-stock offers so the storefront stops showing them as buyable;
 * - {@link checkBatStoreStockBeforeCharge}, the checkout preflight, which
 *   refuses to take a customer's money for stock the supplier cannot deliver.
 *
 * The preflight is the guard of last resort. Parking is a snapshot decision and
 * a snapshot can be stale, the supplier can sell out between two sweeps, and an
 * administrator can knowingly re-activate an out-of-stock offer — all three
 * paths end with a customer being charged for something that cannot be
 * delivered unless the money path itself asks the supplier.
 */

/** Live product read is cached this long so a burst of checkouts costs one call. */
const STOCK_CACHE_TTL_MS = 30_000;

/** How long one `low_stock` alert per offer is deduplicated for. */
const LOW_STOCK_ALERT_BUCKET_MS = 6 * 60 * 60 * 1000;

export type BatStoreStockLevel = {
  /** BatStore's `stock` number, or null when the API reported none. */
  stock: number | null;
  /** Whether the offer may be sold right now. */
  available: boolean;
  /** The product is BatStore's own test product; never sellable. */
  isTest: boolean;
};

export type BatStoreStockRead =
  | {
      ok: true;
      /** Stock keyed by BatStore product id. */
      products: Map<string, BatStoreStockLevel>;
      readAt: number;
    }
  | { ok: false; reason: string };

type CacheEntry = { read: Extract<BatStoreStockRead, { ok: true }>; apiToken: string };

let cachedRead: CacheEntry | null = null;
let inFlight: { promise: Promise<BatStoreStockRead>; apiToken: string } | null = null;

/** Only for tests: drop the in-memory read cache. */
export function resetBatStoreStockCache(): void {
  cachedRead = null;
  inFlight = null;
}

/**
 * BatStore's own definition of sellable, mirrored from the importer
 * (`batstore-import.service.ts`): a positive count is stock, a missing count is
 * unknown and therefore not stock, and a test product is never stock.
 */
export function toStockLevel(product: { stock: number | null; isTest: boolean }): BatStoreStockLevel {
  const stock = product.stock !== null && Number.isFinite(product.stock) ? product.stock : null;

  return {
    stock,
    available: !product.isTest && stock !== null && stock > 0,
    isTest: product.isTest,
  };
}

/**
 * The live BatStore stock snapshot, cached for {@link STOCK_CACHE_TTL_MS}.
 *
 * A failure is returned, never thrown: the caller decides whether a supplier
 * outage blocks money. Concurrent callers share one in-flight read so a burst
 * of checkouts cannot multiply the supplier's request volume.
 */
export async function readBatStoreStock(
  apiToken: string,
  now: number = Date.now(),
): Promise<BatStoreStockRead> {
  if (cachedRead && cachedRead.apiToken === apiToken && now < cachedRead.read.readAt + STOCK_CACHE_TTL_MS) {
    return cachedRead.read;
  }

  if (inFlight && inFlight.apiToken === apiToken) {
    return inFlight.promise;
  }

  const promise = (async (): Promise<BatStoreStockRead> => {
    try {
      const products = await new BatStoreClient(apiToken).listProducts();
      const levels = new Map<string, BatStoreStockLevel>();

      for (const product of products) {
        levels.set(product.id, toStockLevel(product));
      }

      const read = { ok: true as const, products: levels, readAt: Date.now() };

      cachedRead = { read, apiToken };

      return read;
    } catch (error) {
      logFailure("provider.batstore", "stock_read_failed", error, { provider: BATSTORE_PROVIDER_NAME });

      return { ok: false, reason: error instanceof Error ? error.message : "BatStore stock could not be read." };
    }
  })();

  inFlight = { promise, apiToken };

  try {
    return await promise;
  } finally {
    inFlight = null;
  }
}

/** The stored BatStore key and enablement, or null when the provider is off. */
export async function loadBatStoreToken(
  supabase: SupabaseClient<Database>,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("store_settings")
    .select("providers")
    .eq("id", "global")
    .maybeSingle();

  if (error) {
    log.warn("provider.batstore", "stock_settings_read_failed", { error: error.message });

    return null;
  }

  const { apiToken, enabled } = readBatStoreCredentials((data?.providers ?? {}) as Json);

  return apiToken && enabled ? apiToken : null;
}

export type BatStoreStockGuardResult =
  /** Not a BatStore offer — nothing to check here. */
  | { ok: true; batstore: false }
  | { ok: true; batstore: true; productId: string; available: number }
  | { ok: false; batstore: true; reason: "out_of_stock"; available: number; productId: string }
  /** The supplier could not be asked. Fails closed, like the G2Bulk wallet guard. */
  | { ok: false; batstore: true; reason: "supplier_unavailable"; detail: string };

/**
 * Is there enough BatStore stock behind this offer to cover `quantity`?
 *
 * Called before the wallet is debited. Every uncertain outcome refuses:
 *
 * - the offer is not mapped to BatStore → `ok: true, batstore: false`, left to
 *   whichever supplier owns it (this is not BatStore's guard to make);
 * - BatStore is not configured → refuse as unavailable, because a BatStore
 *   offer with no key can never be fulfilled;
 * - the supplier cannot be reached → refuse as unavailable;
 * - the supplier no longer lists the product at all → refuse as out of stock.
 *   A delisted product cannot be ordered (`POST /orders` would reject it), and
 *   live data has 29 of the 57 BatStore mappings in exactly that state —
 *   including product #83, one of the two orders that failed;
 * - the supplier has less than `quantity` → refuse as out of stock and alert
 *   the owner once per offer per six hours.
 *
 * The one thing it never does is throw: a guard that can fail open on an
 * exception is not a guard.
 */
export async function checkBatStoreStockBeforeCharge(
  supabase: SupabaseClient<Database>,
  offerId: string,
  quantity: number,
  options: { now?: number } = {},
): Promise<BatStoreStockGuardResult> {
  try {
    const { data: mapping, error } = await supabase
      .from("provider_offer_mappings")
      .select("external_product_id, metadata")
      .eq("offer_id", offerId)
      .eq("provider_name", BATSTORE_PROVIDER_NAME)
      .maybeSingle();

    if (error) {
      log.warn("provider.batstore", "stock_mapping_read_failed", { offerId, error: error.message });

      return { ok: false, batstore: true, reason: "supplier_unavailable", detail: "mapping unreadable" };
    }

    if (!mapping?.external_product_id) {
      return { ok: true, batstore: false };
    }

    const productId = mapping.external_product_id;

    /*
     * The snapshot the last sync recorded is a free, second opinion: when it
     * already says there is nothing to sell, the customer is refused without
     * spending a supplier call, and a supplier outage cannot turn a known-empty
     * offer into a sale. `not_listed` counts — the sweep deliberately leaves a
     * delisted mapping's offer alone, so the snapshot is the only local record
     * that the product cannot be ordered.
     */
    const snapshot = asMetadata(mapping.metadata);
    const snapshotStock = toFiniteNumber(snapshot.stock);
    const requested = Math.max(1, Math.floor(quantity || 1));

    if (
      snapshot.availability_status === "out_of_stock" ||
      snapshot.availability_status === "not_listed" ||
      (snapshotStock !== null && snapshotStock <= 0)
    ) {
      await alertLowStock(
        offerId,
        productId,
        0,
        requested,
        options.now ?? Date.now(),
        snapshot.availability_status === "not_listed" ? "delisted" : "out_of_stock",
      );

      return { ok: false, batstore: true, reason: "out_of_stock", available: 0, productId };
    }

    const apiToken = await loadBatStoreToken(supabase);

    if (!apiToken) {
      return { ok: false, batstore: true, reason: "supplier_unavailable", detail: "BatStore is not configured" };
    }

    const read = await readBatStoreStock(apiToken, options.now);

    if (!read.ok) {
      return { ok: false, batstore: true, reason: "supplier_unavailable", detail: read.reason };
    }

    /*
     * `level === undefined` means BatStore's product list does not contain this
     * product at all. That is not "unknown stock", it is "cannot be bought":
     * `POST /orders` would reject the product id. Live data has 29 of the 57
     * BatStore mappings in this state — including product #83, one of the two
     * orders that were charged and then failed — so refusing here is the whole
     * difference between a caught failure and a refund cycle.
     */
    const level = read.products.get(productId);
    const available = level?.available ? (level.stock ?? 0) : 0;

    if (!level) {
      await alertLowStock(offerId, productId, 0, requested, options.now ?? Date.now(), "delisted");

      return { ok: false, batstore: true, reason: "out_of_stock", available: 0, productId };
    }

    if (!level.available || available < requested) {
      await alertLowStock(offerId, productId, available, requested, options.now ?? Date.now(), "out_of_stock");

      return { ok: false, batstore: true, reason: "out_of_stock", available, productId };
    }

    return { ok: true, batstore: true, productId, available };
  } catch (error) {
    // Includes a missing service-role key and any unexpected shape. Fails
    // closed, and never throws into checkout.
    logFailure("provider.batstore", "stock_guard_threw", error, { offerId });

    return { ok: false, batstore: true, reason: "supplier_unavailable", detail: "guard failure" };
  }
}

/**
 * Tell the owner BatStore stock is blocking sales.
 *
 * `low_stock` is an existing alert type with an existing Telegram and in-app
 * rendering, so this needs no new plumbing and no second migration. The dedup
 * key is a six-hour bucket per offer: repeated refused checkouts must not flood
 * the chat, but an offer that stays empty overnight is worth mentioning again.
 *
 * `reason` distinguishes "the supplier is out of it" from "the supplier no
 * longer lists it", because those need different actions from the owner —
 * restock versus retire the offer.
 */
export async function alertLowStock(
  offerId: string,
  productId: string,
  available: number,
  requested: number,
  now: number,
  reason: "out_of_stock" | "delisted" = "out_of_stock",
): Promise<void> {
  await enqueueTelegramAlert({
    type: "low_stock",
    payload: {
      provider: BATSTORE_PROVIDER_NAME,
      offer_id: offerId,
      product_id: productId,
      remaining: available,
      requested,
      reason,
    },
    dedupKey: `low_stock:${BATSTORE_PROVIDER_NAME}:${productId}:${Math.floor(now / LOW_STOCK_ALERT_BUCKET_MS)}`,
  });
}

export function asMetadata(value: Json | null | undefined): Record<string, Json> {
  return value !== null && value !== undefined && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Json>)
    : {};
}

function toFiniteNumber(value: Json | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);

    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

/** A guard usable from anywhere with a service client; fails closed. */
export async function isBatStoreOfferInStock(offerId: string, quantity: number): Promise<boolean> {
  try {
    const result = await checkBatStoreStockBeforeCharge(createSupabaseServiceClient(), offerId, quantity);

    return result.ok;
  } catch {
    return false;
  }
}
