import type { SupabaseClient } from "@supabase/supabase-js";
import { BATSTORE_PROVIDER_NAME } from "@server/providers/batstore/mapping";
import {
  asMetadata,
  loadBatStoreToken,
  readBatStoreStock,
  type BatStoreStockLevel,
} from "@server/lib/services/batstore-stock.service";
import { log, logFailure } from "@server/lib/logging/logger";
import type { Database, Json } from "@server/types/database";

/**
 * The scheduled BatStore stock sweep.
 *
 * ## Why a sweep at all
 *
 * BatStore is a Telegram bot with dynamic stock. The storefront decides
 * visibility from `offers.is_active`, and the import service can already park a
 * zero-stock offer (`is_active = false` plus
 * `provider_offer_mappings.metadata.parked_by_stock_sync = true`). That ability
 * only ever ran when a human pressed "import", which is the hole the two live
 * BatStore failures came through: the offer stayed active through the supplier
 * running dry, the customer was charged, and the supplier answered
 * `Insufficient stock for product #16 (requested 1, available 0)`.
 *
 * ## Why this runs on the existing tick, throttled
 *
 * The Worker already ticks every five minutes for the Telegram scheduler and
 * the fulfilment sweep (`storefront/workers/app.ts`), so there is no new
 * schedule, no new infrastructure, and no new CPU budget to argue for. The
 * sweep itself is throttled to at most one real refresh per
 * {@link DEFAULT_STOCK_SYNC_THROTTLE_MS}: a stock snapshot that is 30 minutes
 * stale is exactly how a customer buys an out-of-stock item, and one supplier
 * call every 15 minutes across ~57 mappings is cheap enough to run forever.
 *
 * ## What it may and may not do
 *
 * It changes stock availability only. **It never writes a price and never
 * deletes or creates a mapping** — the supplier cost and the retail price stay
 * exactly as the operator and the catalogue set them. `is_active` is the only
 * column it writes on `offers`.
 *
 * The automatic restore is narrow on purpose: an offer is re-activated only
 * when the sync itself parked it, which is what
 * `metadata.parked_by_stock_sync === true` records — the same marker the
 * importer already sets and the admin catalogue clears when an administrator
 * saves the offer by hand
 * (`legacy/lib/services/admin-catalog.service.ts`, which sets it to `false`).
 * A zero-stock offer that an administrator deliberately re-activated is left
 * alone and reported instead of being silently re-parked; the checkout
 * preflight refuses to sell it, so the decision stays the administrator's and
 * the customer is still protected.
 *
 * ## Failure containment
 *
 * One product failing does not abort the batch, a missing key skips cleanly
 * with a log line, and the whole run is wrapped so it cannot throw. The
 * exported entry point is safe to call from a `scheduled` handler without a
 * try/catch of its own.
 */

/**
 * At most one real BatStore refresh per 15 minutes.
 *
 * Chosen over 30: the tick is 5 minutes, so 15 keeps a sold-out offer off the
 * storefront for at most three ticks while holding supplier traffic to four
 * product-list reads an hour. An operator who wants a different cadence changes
 * this constant; it is deliberately not a settings field, because a sweep that
 * can be misconfigured into "never" is the bug this replaces.
 */
export const DEFAULT_STOCK_SYNC_THROTTLE_MS = 15 * 60 * 1000;

/** Mappings per run, mirroring the reconciliation sweep's `DEFAULT_BATCH = 10`. */
export const DEFAULT_STOCK_SYNC_BATCH = 10;

/** Provider kind recorded in `provider_sync_state` and `provider_sync_logs`. */
export const STOCK_SYNC_KIND = "stock_sync";

export type BatStoreStockSyncRun = {
  /** False when the throttle window had not elapsed or a prerequisite was missing. */
  ran: boolean;
  reason: "ok" | "throttled" | "no_credentials" | "store_error";
  scanned: number;
  parked: number;
  unparked: number;
  unchanged: number;
  /** Mappings whose update failed; the next tick retries them. */
  failed: number;
};

type MappingRow = {
  offer_id: string;
  external_product_id: string | null;
  metadata: Json | null;
};

type OfferRow = {
  id: string;
  is_active: boolean;
};

/** One mapping joined to the offer row the sweep has to decide about. */
export type StockDecision = {
  offerId: string;
  productId: string;
  level: BatStoreStockLevel | null;
  wasActive: boolean;
  /**
   * `metadata.parked_by_stock_sync === true` — the sweep is holding this offer
   * down and may lift it on restock.
   */
  wasParkedByStockSync: boolean;
  /**
   * `metadata.stock_override_at` is set — an administrator has edited this offer
   * by hand since the sweep last parked it. Their decision wins for the rest of
   * the depletion: the sweep must not park it again behind their back.
   */
  adminOverrodeStock: boolean;
};

export type StockPlanAction = "park" | "unpark" | "skip";

/**
 * What the sweep should do about one mapping — pure, so every rule is testable
 * without a database or a supplier.
 *
 * Rules, in order:
 *
 * 1. An **administrator has overridden this offer since the sweep last parked
 *    it** (`stock_override_at` is set). Their decision wins outright: the sweep
 *    neither parks nor unparks it. A zero-stock offer they chose to keep visible
 *    is then protected by the checkout preflight, which refuses the sale and
 *    alerts the owner — so the store never charges for what it cannot deliver
 *    and never silently undoes a human decision.
 * 2. The supplier no longer lists the product (`level === null`). Leave the
 *    offer exactly as it is: a delisted product is an operator decision (retire
 *    it, re-map it), not a stock event, and hiding a still-deliverable offer
 *    because the supplier's listing moved would cost the store sales.
 * 3. The product is BatStore's own test product, or the supplier reported a
 *    zero/unknown count → park, but only while the offer is active and the
 *    sweep owns the parking. `parked_by_stock_sync === true` is that ownership
 *    marker, so an offer a *previous* sweep parked and an administrator then
 *    re-activated is not fought over twice.
 * 4. Known stock ≥ 1 and the offer is inactive *because this sweep parked it* →
 *    unpark. That is the restock path.
 * 5. Anything else → leave alone.
 */
export function planStockAction(decision: StockDecision): StockPlanAction {
  const { level, wasActive, wasParkedByStockSync, adminOverrodeStock } = decision;

  if (adminOverrodeStock) {
    return "skip";
  }

  if (level === null) {
    return "skip";
  }

  if (!level.available) {
    return wasActive && !wasParkedByStockSync ? "park" : "skip";
  }

  return !wasActive && wasParkedByStockSync ? "unpark" : "skip";
}

/**
 * Whether the sweep keeps ownership of this offer's parking after the run.
 *
 * Kept as a pure function because it is the whole contract with the admin
 * catalogue: `true` means "the sweep is holding this offer down and may lift it
 * on restock", `false` means "somebody else owns this decision".
 */
export function nextParkedFlag(
  level: BatStoreStockLevel | null,
  action: StockPlanAction,
  wasParkedByStockSync: boolean,
): boolean {
  if (action === "park") {
    return true;
  }

  // A restock clears the flag: the offer is visible again and nothing is being
  // held down. A delisted product or a manual override preserves it.
  if (level?.available) {
    return false;
  }

  return wasParkedByStockSync;
}

/** The mapping metadata the sweep maintains, carrying every other key across. */
export function nextStockMetadata(
  metadata: Json | null,
  level: BatStoreStockLevel | null,
  parkedByStockSync: boolean,
  syncedAt: string,
  productId: string,
): Json {
  const previous = asMetadata(metadata);
  const reported = level?.stock ?? null;
  const stock = reported !== null && Number.isFinite(reported) ? reported : null;

  return {
    ...previous,
    product_id: productId,
    stock,
    availability_status: level === null
      ? "not_listed"
      : level.isTest
        ? "test"
        : stock === null
          ? "unknown"
          : stock > 0
            ? "in_stock"
            : "out_of_stock",
    parked_by_stock_sync: parkedByStockSync,
    stock_synced_at: syncedAt,
  };
}

/**
 * Whether an administrator has overridden this offer's availability since the
 * sweep parked it.
 *
 * `parked_by_stock_sync === false` alone cannot say: it is also what a fresh,
 * never-parked offer looks like, and that offer *must* be parked when the
 * supplier runs dry. `stock_override_at` is written only by the admin catalogue
 * when it clears a stock park, so its presence is unambiguous — a human touched
 * this offer after the sweep did.
 */
export function readStockOverride(metadata: Json | null): boolean {
  const value = asMetadata(metadata).stock_override_at;

  return typeof value === "string" && value.length > 0;
}

function readLastRunAt(value: unknown): number | null {
  if (typeof value !== "string") {
    return null;
  }

  const parsed = Date.parse(value);

  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Read the throttle row. A missing table (migration not applied) or an
 * unreadable row is reported, not thrown — the Worker tick must survive a
 * deployment that lands before its migration.
 *
 * The cursor is the rotation state: with 57 mappings and a batch of 10, a run
 * that always read the same first ten would leave 47 offers unchecked forever.
 * The cursor remembers where the last batch stopped.
 */
async function readThrottle(
  supabase: SupabaseClient<Database>,
): Promise<{ ok: true; lastRunAt: number | null; cursor: string | null } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from("provider_sync_state")
    .select("last_run_at, details")
    .eq("provider_name", BATSTORE_PROVIDER_NAME)
    .eq("kind", STOCK_SYNC_KIND)
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message };
  }

  const details = asMetadata(data?.details);

  return {
    ok: true,
    lastRunAt: readLastRunAt(data?.last_run_at),
    cursor: typeof details.cursor === "string" && details.cursor.length > 0 ? details.cursor : null,
  };
}

/**
 * Stamp the throttle row. Called *before* the supplier read so a slow read
 * cannot let the next tick start a second refresh inside the same window, and
 * again at the end with the run's counts.
 */
async function writeThrottle(
  supabase: SupabaseClient<Database>,
  lastRunAt: string,
  details: Json,
): Promise<void> {
  const { data, error } = await supabase
    .from("provider_sync_state")
    .select("id")
    .eq("provider_name", BATSTORE_PROVIDER_NAME)
    .eq("kind", STOCK_SYNC_KIND)
    .maybeSingle();

  if (error) {
    log.warn("provider.batstore", "stock_sync_state_read_failed", { error: error.message });

    return;
  }

  if (data?.id) {
    const { error: updateError } = await supabase
      .from("provider_sync_state")
      .update({ last_run_at: lastRunAt, details })
      .eq("id", data.id);

    if (updateError) {
      log.warn("provider.batstore", "stock_sync_state_write_failed", { error: updateError.message });
    }

    return;
  }

  const { error: insertError } = await supabase.from("provider_sync_state").insert({
    provider_name: BATSTORE_PROVIDER_NAME,
    kind: STOCK_SYNC_KIND,
    last_run_at: lastRunAt,
    details,
  });

  if (insertError) {
    log.warn("provider.batstore", "stock_sync_state_insert_failed", { error: insertError.message });
  }
}

/** Record the run the way `reconciliation.service.ts` records its own. */
async function recordRun(
  supabase: SupabaseClient<Database>,
  run: BatStoreStockSyncRun,
  startedAt: string,
  details: Json,
): Promise<void> {
  const { error } = await supabase.from("provider_sync_logs").insert({
    provider_name: BATSTORE_PROVIDER_NAME,
    kind: STOCK_SYNC_KIND,
    status: run.failed > 0 ? "partial" : "succeeded",
    requested_count: run.scanned,
    created_count: 0,
    // `updated_count` is the offers this run changed: parked + unparked.
    updated_count: run.parked + run.unparked,
    skipped_count: run.unchanged,
    failed_count: run.failed,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    details,
  });

  if (error) {
    log.warn("provider.batstore", "stock_sync_log_failed", { error: error.message });
  }
}

/**
 * Refresh BatStore stock for one small batch of mappings.
 *
 * Never throws. Every failure is counted, logged, and left for the next tick.
 */
export async function syncBatStoreStock(
  supabase: SupabaseClient<Database>,
  options: { batchSize?: number; throttleMs?: number; now?: number; force?: boolean } = {},
): Promise<BatStoreStockSyncRun> {
  const startedAt = new Date().toISOString();
  const now = options.now ?? Date.now();
  const throttleMs = options.throttleMs ?? DEFAULT_STOCK_SYNC_THROTTLE_MS;
  const batchSize = options.batchSize ?? DEFAULT_STOCK_SYNC_BATCH;

  const skip = (reason: BatStoreStockSyncRun["reason"]): BatStoreStockSyncRun => ({
    ran: false,
    reason,
    scanned: 0,
    parked: 0,
    unparked: 0,
    unchanged: 0,
    failed: 0,
  });

  try {
    let cursor: string | null = null;

    if (!options.force) {
      const throttle = await readThrottle(supabase);

      if (!throttle.ok) {
        // A deployment that predates the migration must not break the tick; it
        // simply has no throttle state yet and so cannot safely run.
        log.warn("provider.batstore", "stock_sync_throttle_unavailable", { error: throttle.error });

        return skip("store_error");
      }

      if (throttle.lastRunAt !== null && now - throttle.lastRunAt < throttleMs) {
        return skip("throttled");
      }

      cursor = throttle.cursor;
    }

    const apiToken = await loadBatStoreToken(supabase);

    if (!apiToken) {
      // A missing key is a configuration state, not an error: skip cleanly.
      log.info("provider.batstore", "stock_sync_skipped_unconfigured", {
        provider: BATSTORE_PROVIDER_NAME,
      });

      return skip("no_credentials");
    }

    // Stamp the window before the supplier call so a slow read cannot let the
    // next tick start a second one.
    await writeThrottle(supabase, new Date(now).toISOString(), {
      status: "running",
      ...(cursor ? { cursor } : {}),
    });

    /*
     * Read the batch after the cursor, not the first batch.
     *
     * `offer_id` is a random uuid, so this ordering is arbitrary but stable —
     * exactly what a rotation needs, and it needs no extra column or index.
     * When the cursor reaches the end the next run starts again from the top,
     * so every mapping is refreshed within
     * `ceil(total / batchSize) * throttleMs` (57 mappings at 10 per 15 minutes
     * ⇒ the full set every 90 minutes, each individual offer at most that stale).
     */
    const { data: mappingPage, error: mappingError } = await supabase
      .from("provider_offer_mappings")
      .select("offer_id, external_product_id, metadata")
      .eq("provider_name", BATSTORE_PROVIDER_NAME)
      .not("external_product_id", "is", null)
      .order("offer_id", { ascending: true })
      .gt("offer_id", cursor ?? "00000000-0000-0000-0000-000000000000")
      .limit(batchSize);

    if (mappingError) {
      log.warn("provider.batstore", "stock_sync_mappings_failed", { error: mappingError.message });

      return skip("store_error");
    }

    let mappingRows = mappingPage;

    if ((mappingRows ?? []).length === 0 && cursor !== null) {
      // End of the rotation: wrap to the beginning in the same run so a small
      // catalogue still gets a full pass rather than an empty one.
      const wrap = await supabase
        .from("provider_offer_mappings")
        .select("offer_id, external_product_id, metadata")
        .eq("provider_name", BATSTORE_PROVIDER_NAME)
        .not("external_product_id", "is", null)
        .order("offer_id", { ascending: true })
        .limit(batchSize);

      if (wrap.error) {
        log.warn("provider.batstore", "stock_sync_mappings_failed", { error: wrap.error.message });

        return skip("store_error");
      }

      mappingRows = wrap.data;
      cursor = null;

      if ((mappingRows ?? []).length === 0) {
        // Every mapping is gone: clear the stale cursor so the next real
        // mapping starts the rotation from the top.
        await writeThrottle(supabase, new Date(now).toISOString(), { status: "ok" });

        return { ...skip("ok"), ran: true };
      }
    }

    const mappings = (mappingRows ?? []) as unknown as MappingRow[];

    if (mappings.length === 0) {
      return { ...skip("ok"), ran: true };
    }

    const stockRead = await readBatStoreStock(apiToken, now);

    if (!stockRead.ok) {
      log.warn("provider.batstore", "stock_sync_read_failed", { error: stockRead.reason });

      return skip("store_error");
    }

    const { data: offerRows, error: offerError } = await supabase
      .from("offers")
      .select("id, is_active")
      .in(
        "id",
        mappings.map((mapping) => mapping.offer_id),
      );

    if (offerError) {
      log.warn("provider.batstore", "stock_sync_offers_failed", { error: offerError.message });

      return skip("store_error");
    }

    const offers = new Map<string, OfferRow>(
      ((offerRows ?? []) as unknown as OfferRow[]).map((offer) => [offer.id, offer]),
    );

    let parked = 0;
    let unparked = 0;
    let unchanged = 0;
    let failed = 0;
    const changed: Json[] = [];
    const skipped: Json[] = [];

    for (const mapping of mappings) {
      const productId = mapping.external_product_id ?? "";
      const offer = offers.get(mapping.offer_id);

      if (!offer) {
        // The offer disappeared mid-run (cascade delete). Nothing to do.
        unchanged += 1;
        continue;
      }

      // Every product is handled inside its own try/catch: one bad row must not
      // cost the operator the rest of the batch.
      try {
        const level = stockRead.products.get(productId) ?? null;
        const previous = asMetadata(mapping.metadata);
        const wasParkedByStockSync = previous.parked_by_stock_sync === true;
        const adminOverrodeStock = readStockOverride(mapping.metadata);
        const action = planStockAction({
          offerId: mapping.offer_id,
          productId,
          level,
          wasActive: offer.is_active,
          wasParkedByStockSync,
          adminOverrodeStock,
        });

        if (action !== "skip") {
          const { error: offerUpdateError } = await supabase
            .from("offers")
            .update({ is_active: action === "unpark", updated_at: new Date(now).toISOString() })
            .eq("id", mapping.offer_id);

          if (offerUpdateError) {
            failed += 1;
            log.warn("provider.batstore", "stock_sync_offer_update_failed", {
              offerId: mapping.offer_id,
              error: offerUpdateError.message,
            });

            continue;
          }

          if (action === "park") {
            parked += 1;
          } else {
            unparked += 1;
          }

          changed.push({
            offer_id: mapping.offer_id,
            product_id: productId,
            action,
            stock: level?.stock ?? null,
          });
        } else {
          unchanged += 1;

          if (level === null) {
            skipped.push({ offer_id: mapping.offer_id, product_id: productId, reason: "not_listed" });
          } else if (adminOverrodeStock && !level.available && offer.is_active) {
            // The owner kept this zero-stock offer on sale by hand. The sweep
            // has already given them one `low_stock` alert when it parked the
            // offer, and the checkout preflight alerts again the moment a
            // customer actually tries to buy it — so this run only records the
            // override rather than repeating the message every 15 minutes.
            skipped.push({ offer_id: mapping.offer_id, product_id: productId, reason: "manual_override" });
          }
        }

        const nextParked = nextParkedFlag(level, action, wasParkedByStockSync);

        const { error: mappingUpdateError } = await supabase
          .from("provider_offer_mappings")
          .update({
            metadata: nextStockMetadata(
              mapping.metadata,
              level,
              nextParked,
              new Date(now).toISOString(),
              productId,
            ),
            updated_at: new Date(now).toISOString(),
          })
          .eq("offer_id", mapping.offer_id)
          .eq("provider_name", BATSTORE_PROVIDER_NAME);

        if (mappingUpdateError) {
          failed += 1;
          log.warn("provider.batstore", "stock_sync_metadata_failed", {
            offerId: mapping.offer_id,
            error: mappingUpdateError.message,
          });
        }
      } catch (error) {
        failed += 1;
        logFailure("provider.batstore", "stock_sync_product_failed", error, {
          offerId: mapping.offer_id,
          productId,
        });
      }
    }

    const run: BatStoreStockSyncRun = {
      ran: true,
      reason: "ok",
      scanned: mappings.length,
      parked,
      unparked,
      unchanged,
      failed,
    };

    // The next run starts where this one stopped, so the whole catalogue is
    // covered over several ticks instead of the same ten rows forever.
    const lastOfferId = mappings[mappings.length - 1]?.offer_id ?? null;

    await writeThrottle(supabase, new Date(now).toISOString(), {
      status: "ok",
      ...(lastOfferId ? { cursor: lastOfferId } : {}),
      parked,
      unparked,
      unchanged,
      failed,
    });
    await recordRun(supabase, run, startedAt, { changed, skipped });

    log.info("provider.batstore", "stock_sync_run", {
      provider: BATSTORE_PROVIDER_NAME,
      scanned: run.scanned,
      parked: run.parked,
      unparked: run.unparked,
      failed: run.failed,
    });

    return run;
  } catch (error) {
    // The last line of defence: nothing below may reach the Worker's scheduled
    // handler, where an uncaught throw would take the fulfilment sweep with it.
    logFailure("provider.batstore", "stock_sync_threw", error);

    return skip("store_error");
  }
}

/**
 * The Worker-tick entry point.
 *
 * Reads the throttle, refreshes a small batch when the window has elapsed, and
 * records the run. **Never throws** — a failure here is a log line, not a
 * broken schedule.
 */
export async function runBatStoreStockSyncScheduled(
  supabase: SupabaseClient<Database>,
  options: { batchSize?: number; throttleMs?: number; now?: number; force?: boolean } = {},
): Promise<BatStoreStockSyncRun> {
  try {
    return await syncBatStoreStock(supabase, options);
  } catch (error) {
    logFailure("provider.batstore", "stock_sync_scheduled_threw", error);

    return {
      ran: false,
      reason: "store_error",
      scanned: 0,
      parked: 0,
      unparked: 0,
      unchanged: 0,
      failed: 0,
    };
  }
}
