import "server-only";

import { isAdminProfile, requireAuth, UnauthorizedError } from "@/lib/auth/guards";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isG2BulkOfferAffordable } from "@/lib/services/g2bulk-availability.service";
import { enqueueTelegramAlert } from "@/lib/services/telegram-alerts.service";
import { fulfillOrder } from "@/lib/services/fulfillment.service";
import { logFailure, logOutcome } from "@/lib/logging/logger";

/**
 * Placing an order.
 *
 * The money side is one database transaction (`place_wallet_order`): it re-reads
 * the price, locks the wallet, debits, and creates the order together, so there
 * is no window in which a customer is charged without an order or holds an order
 * they did not pay for.
 *
 * Fulfilment is deliberately a separate step. It talks to an outside supplier and
 * can fail, hang, or be slow, and none of that may reach back into the payment
 * transaction. An order therefore exists as `paid` before anything is bought from
 * the provider, and a fulfilment failure is settled by refunding — never by
 * pretending the payment did not happen.
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
  offerSlug: string;
  gameSlug: string;
  quantity: number;
  dynamicFields: Record<string, string>;
  idempotencyKey: string;
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

/**
 * Place an order, and say so.
 *
 * The attempt is a separate function purely so there is one exit to log rather
 * than seven. The event is named for the attempt, not the success, because a
 * refused checkout is the same event with a reason attached — and counting both
 * under one name is what makes "how often does insufficient_balance happen"
 * answerable.
 *
 * The customer's account fields are deliberately not among the logged fields.
 * They are the player ids and server names the supplier needs, `redact` has no
 * way to know they are sensitive, and no debugging question needs them.
 */
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
  let user: { id: string };

  try {
    user = await requireAuth();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return { ok: false, reason: "unauthenticated" };
    }

    throw error;
  }

  const supabase = await createSupabaseServerClient();

  // Admins have no customer wallet. Their checkout goes through the gift path
  // (paid on arrival, recorded as a normal invoice), so the wallet RPC and its
  // balance checks never apply to them.
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return { ok: false, reason: "unknown" };
  }

  const isAdmin = isAdminProfile(profile);

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

  const deliveryKind = offer.delivery_kind;

  if (
    !isAdmin &&
    deliveryKind !== "manual" &&
    deliveryKind !== "stored" &&
    !(await isG2BulkOfferAffordable(offer.id, input.quantity))
  ) {
    return { ok: false, reason: "supplier_unavailable" };
  }

  const { data, error } = await supabase
    .rpc(isAdmin ? "place_gift_order" : "place_wallet_order", {
      p_offer_id: offer.id,
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

  await enqueueTelegramAlert({
    type: "order_placed",
    payload: {
      order_id: data.order_id,
      order_number: data.order_number,
      total: data.total,
      offer_id: offer.id,
    },
  });

  /*
   * Fulfilment runs after the order is safely paid, and its failure must never
   * fail the checkout response: the customer's money is already accounted for
   * either way, and a thrown error here would tell them the purchase failed when
   * it did not. Anything unexpected leaves the order `paid` for the reconciler.
   */
  try {
    await fulfillOrder(data.order_id);
  } catch (error) {
    logFailure("fulfilment", "checkout_fulfilment_threw", error, { orderId: data.order_id });
    // Intentionally swallowed; the order page shows the real state.
  }

  return {
    ok: true,
    orderId: data.order_id,
    orderNumber: data.order_number,
    total: data.total,
    balance: data.balance,
  };
}
