import "server-only";

import { requireAuth, UnauthorizedError } from "@/lib/auth/guards";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fulfillOrder } from "@/lib/services/fulfillment.service";

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
  try {
    await requireAuth();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return { ok: false, reason: "unauthenticated" };
    }

    throw error;
  }

  const supabase = await createSupabaseServerClient();

  // Resolve the offer by its public slugs. The id is never taken from the
  // browser, so a crafted form cannot point checkout at a different product.
  const { data: offer, error: offerError } = await supabase
    .from("offers")
    .select("id, games!inner (slug)")
    .eq("slug", input.offerSlug)
    .eq("is_active", true)
    .eq("games.slug", input.gameSlug)
    .eq("games.is_active", true)
    .maybeSingle();

  if (offerError || !offer) {
    return { ok: false, reason: "unavailable" };
  }

  const { data, error } = await supabase
    .rpc("place_wallet_order", {
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

  /*
   * Fulfilment runs after the order is safely paid, and its failure must never
   * fail the checkout response: the customer's money is already accounted for
   * either way, and a thrown error here would tell them the purchase failed when
   * it did not. Anything unexpected leaves the order `paid` for the reconciler.
   */
  try {
    await fulfillOrder(data.order_id);
  } catch {
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
