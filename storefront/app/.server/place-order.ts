import type { SupabaseClient } from "@supabase/supabase-js";
import { isAdminProfile } from "@server/lib/auth/guards";
import { isG2BulkOfferAffordable } from "@server/lib/services/g2bulk-availability.service";
import { enqueueTelegramAlert } from "@server/lib/services/telegram-alerts.service";
import { fulfillOrder } from "@server/fulfillment";
import { logFailure, logOutcome } from "@server/lib/logging/logger";

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
  | { ok: true; orderId: string; orderNumber: string; total: number; balance: number }
  | {
      ok: false;
      reason:
        | "unauthenticated"
        | "suspended"
        | "unavailable"
        | "insufficient_balance"
        | "supplier_unavailable"
        | "in_progress"
        | "invalid_fields"
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
  /** Route's background runner (ctx.waitUntil) for fulfilment + alerts. */
  schedule: (promise: Promise<unknown>) => void;
};

/** Map the RPC's raised messages onto reasons a page can explain. */
function reasonFromError(message: string): PlaceOrderResult {
  const text = message.toLowerCase();

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

  const deliveryKind = (offer as { delivery_kind: string }).delivery_kind;
  const offerId = (offer as { id: string }).id;

  if (
    !isAdmin &&
    deliveryKind !== "manual" &&
    deliveryKind !== "stored" &&
    !(await isG2BulkOfferAffordable(offerId, input.quantity))
  ) {
    return { ok: false, reason: "supplier_unavailable" };
  }

  const { data, error } = await supabase
    .rpc(isAdmin ? "place_gift_order" : "place_wallet_order", {
      p_offer_id: offerId,
      p_quantity: input.quantity,
      p_dynamic_fields: input.dynamicFields,
      p_idempotency_key: input.idempotencyKey,
    })
    .maybeSingle();

  if (error) {
    return reasonFromError(error.message);
  }

  if (!data) {
    return { ok: false, reason: "unknown" };
  }

  const placed = data as { order_id: string; order_number: string; total: number; balance: number };

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
        await fulfillOrder(placed.order_id);
      } catch (fulfilError) {
        logFailure("fulfilment", "checkout_fulfilment_threw", fulfilError, {
          orderId: placed.order_id,
        });
        // Intentionally swallowed; the order page shows the real state.
      }
    })(),
  );

  return {
    ok: true,
    orderId: placed.order_id,
    orderNumber: placed.order_number,
    total: placed.total,
    balance: placed.balance,
  };
}
