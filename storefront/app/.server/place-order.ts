import type { SupabaseClient } from "@supabase/supabase-js";
import { isAdminProfile } from "@server/lib/auth/guards";
import { checkBatStoreStockBeforeCharge } from "@server/lib/services/batstore-stock.service";
import { createSupabaseServiceClient } from "@server/lib/supabase/service";
import { enqueueTelegramAlert } from "@server/lib/services/telegram-alerts.service";
import { fulfillOrder } from "@server/fulfillment";
import { logFailure, logOutcome } from "@server/lib/logging/logger";
import { assertVelocityLimit } from "@server/lib/services/velocity-guard.service";

/**
 * Placing an order — Workers port.
 *
 * The money side is one database transaction (`place_wallet_order`): it
 * re-reads the price, locks the wallet, debits, and creates the order
 * together. Fulfilment stays a separate step over `schedule` (the route's
 * `ctx.waitUntil`): supplier calls can fail, hang, or run long, and none of
 * that may reach back into the payment transaction. A fulfilment failure is
 * settled by refund, never by pretending the payment did not happen.
 */

export type PlaceOrderResult =
  | {
      ok: true;
      orderId: string;
      orderNumber: string;
      total: number;
      balance: number;
      /** The discount the database actually applied; 0 when no code was used. */
      discount: number;
    }
  | {
      ok: false;
      reason:
        | "unauthenticated"
        | "suspended"
        | "unavailable"
        | "out_of_stock"
        | "insufficient_balance"
        | "supplier_unavailable"
        | "in_progress"
        | "invalid_fields"
        | "coupon_not_found"
        | "coupon_inactive"
        | "coupon_not_started"
        | "coupon_expired"
        | "coupon_usage_limit"
        | "coupon_already_used"
        | "coupon_below_minimum"
        | "coupon_wrong_scope"
        | "coupon_no_discount"
        | "coupon_below_cost"
        | "too_many"
        | "unknown";
    };

export type PlaceOrderInput = {
  userId: string;
  sessionSupabase: SupabaseClient;
  offerSlug: string;
  gameSlug: string;
  quantity: number;
  dynamicFields: Record<string, string>;
  idempotencyKey: string;
  /**
   * The coupon code the customer typed, and nothing else about it.
   *
   * The code is the only part of a discount that comes from the browser: the
   * amount is recomputed inside the order transaction, from the live price,
   * under a row lock on the coupon.
   */
  couponCode?: string | null;
  /** Route's background runner (ctx.waitUntil) for fulfilment + alerts. */
  schedule: (promise: Promise<unknown>) => void;
};

/** Map the RPC's raised messages onto reasons a page can explain. */
function reasonFromError(message: string): PlaceOrderResult {
  const text = message.toLowerCase();

  // Coupon refusals first: several of them contain words the order branches
  // below also match ("below", "unavailable"), and the specific answer is the
  // useful one.
  if (text.includes("coupon")) {
    if (text.includes("not found")) return { ok: false, reason: "coupon_not_found" };
    if (text.includes("not active")) return { ok: false, reason: "coupon_inactive" };
    if (text.includes("not valid yet")) return { ok: false, reason: "coupon_not_started" };
    if (text.includes("expired")) return { ok: false, reason: "coupon_expired" };
    if (text.includes("usage limit")) return { ok: false, reason: "coupon_usage_limit" };
    if (text.includes("already used")) return { ok: false, reason: "coupon_already_used" };
    if (text.includes("below the coupon minimum")) return { ok: false, reason: "coupon_below_minimum" };
    if (text.includes("does not apply")) return { ok: false, reason: "coupon_wrong_scope" };
    if (text.includes("no discount")) return { ok: false, reason: "coupon_no_discount" };
    if (text.includes("below supplier cost")) return { ok: false, reason: "coupon_below_cost" };
    if (text.includes("required")) return { ok: false, reason: "invalid_fields" };
  }

  if (text.includes("insufficient")) {
    return { ok: false, reason: "insufficient_balance" };
  }
  if (text.includes("already in progress")) {
    return { ok: false, reason: "in_progress" };
  }
  if (text.includes("supplier unavailable")) {
    return { ok: false, reason: "supplier_unavailable" };
  }
  if (text.includes("offer unavailable") || text.includes("wallet not found")) {
    return { ok: false, reason: "unavailable" };
  }
  if (text.includes("suspended")) {
    return { ok: false, reason: "suspended" };
  }
  if (text.includes("authentication required")) {
    return { ok: false, reason: "unauthenticated" };
  }
  return { ok: false, reason: "unknown" };
}

export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  const result = await attemptOrder(input);

  logOutcome("checkout", "checkout_attempted", result, {
    gameSlug: input.gameSlug,
    offerSlug: input.offerSlug,
    quantity: input.quantity,
    ...(result.ok
      ? { orderId: result.orderId, orderNumber: result.orderNumber, total: result.total }
      : {}),
  });

  return result;
}

async function attemptOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  const supabase = input.sessionSupabase;

  // Admins have no customer wallet. Their checkout goes through the gift path
  // (paid on arrival, recorded as a normal invoice), so the wallet RPC and its
  // balance checks never apply to them.
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", input.userId)
    .maybeSingle();

  if (profileError || !profile) {
    return { ok: false, reason: "unknown" };
  }

  const isAdmin = isAdminProfile(
    profile as { role: string | null; is_active: boolean | null },
  );

  // Resolve the offer by its public slugs. The id is never taken from the
  // browser, so a crafted form cannot point checkout at a different product.
  const { data: offer, error: offerError } = await supabase
    .from("offers")
    .select("id, delivery_kind, products!inner (slug)")
    .eq("slug", input.offerSlug)
    .eq("is_active", true)
    .eq("products.slug", input.gameSlug)
    .eq("products.is_active", true)
    .maybeSingle();

  if (offerError || !offer) {
    return { ok: false, reason: "unavailable" };
  }

  const offerId = (offer as { id: string }).id;

  /*
   * Supplier stock preflight, before a single cent leaves the wallet.
   *
   * The BatStore guard is the store's last line of defence against charging for
   * an item the supplier cannot deliver. Parking a zero-stock offer
   * (`is_active = false`, done by the throttled stock sweep) hides it from
   * browse, search, and this very query — but a snapshot can be stale, the
   * supplier can sell out between two sweeps, and an administrator can
   * knowingly re-activate an out-of-stock offer. Two live orders were charged
   * and then failed with `Insufficient stock for product #16 (requested 1,
   * available 0)`, which is exactly what this closes.
   *
   * It fails closed: an unreadable mapping, an unconfigured BatStore, or an
   * unreachable supplier refuses the order rather than risking a refund cycle.
   * It is a no-op for offers that are not mapped to BatStore, so G2Bulk and
   * MaxStore keep their own guards.
   *
   * NOTE FOR THE G2BULK GUARD OWNER: this is the call site
   * `isG2BulkOfferAffordable` (currently dead code — it has no callers) is
   * meant to sit beside. Adding it here is a two-line change:
   * `if (!(await isG2BulkOfferAffordable(offerId, input.quantity))) return
   * { ok: false, reason: "supplier_unavailable" };`
   */
  const stockGuard = await checkBatStoreStockBeforeCharge(
    createSupabaseServiceClient(),
    offerId,
    input.quantity,
  );

  if (!stockGuard.ok) {
    // `out_of_stock` gets its own bilingual customer message; every other
    // refusal reuses the existing "temporarily unavailable" wording. The owner
    // was alerted inside the guard with a deduplicated `low_stock` Telegram
    // alert, so a refused customer is never a silent one.
    return { ok: false, reason: stockGuard.reason };
  }

  const velocity = await assertVelocityLimit(supabase, input.userId, "order");
  if (!velocity.allowed) {
    return { ok: false, reason: "too_many" };
  }

  const { data, error } = await supabase
    .rpc(isAdmin ? "place_gift_order" : "place_wallet_order", {
      p_offer_id: offerId,
      p_quantity: input.quantity,
      p_dynamic_fields: input.dynamicFields,
      p_idempotency_key: input.idempotencyKey,
      // Always sent, even when empty: the parameter is what makes the
      // discount part of the same transaction rather than a second write.
      p_coupon_code: input.couponCode?.trim() || null,
    })
    .maybeSingle();

  if (error) {
    return reasonFromError(error.message);
  }

  if (!data) {
    return { ok: false, reason: "unknown" };
  }

  const placed = data as { order_id: string; order_number: string; total: number; balance: number };

  /*
   * The stored order is the only place the applied discount can be read from:
   * the database computed it, and reporting it back is a read of what
   * happened, not a second calculation.
   */
  const appliedDiscount = await readAppliedCouponDiscount(supabase, placed.order_id);

  input.schedule(
    (async () => {
      try {
        await enqueueTelegramAlert({
          type: "order_placed",
          payload: {
            order_id: placed.order_id,
            order_number: placed.order_number,
            total: placed.total,
            offer_id: offerId,
          },
        });
      } catch (notificationError) {
        logFailure("notifications", "checkout_notification_threw", notificationError, {
          orderId: placed.order_id,
        });
        // Intentionally swallowed; the order page shows the real state.
      }
    })(),
  );
  // Notification outages must never prevent an already-paid order from fulfilling.
  input.schedule(fulfillOrder(placed.order_id).catch(error => {
    logFailure("fulfilment", "checkout_fulfilment_threw", error, { orderId: placed.order_id });
  }));

  return {
    ok: true,
    orderId: placed.order_id,
    orderNumber: placed.order_number,
    total: placed.total,
    balance: placed.balance,
    discount: appliedDiscount,
  };
}

/**
 * The discount recorded on a just-placed order.
 *
 * `orders.discount` is written by the RPC, so this reads the store's own record
 * of the charge rather than re-deriving it. A read failure leaves the caller
 * with 0, which is only used for a log field and an order-page line — never for
 * money — so it must not turn a placed order into an error.
 */
async function readAppliedCouponDiscount(
  supabase: SupabaseClient,
  orderId: string,
): Promise<number> {
  try {
    const { data } = await supabase
      .from("orders")
      .select("discount")
      .eq("id", orderId)
      .maybeSingle();

    return typeof data?.discount === "number" ? data.discount : 0;
  } catch {
    return 0;
  }
}
