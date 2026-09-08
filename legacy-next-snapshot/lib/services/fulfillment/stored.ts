import { enqueueTelegramAlert } from "@/lib/services/telegram-alerts.service";
import { claimStockItems } from "@/lib/services/stock.service";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { FulfillmentContext } from "./context";
import { openAttempt, recordAttempt, setOrderStatus } from "./attempts";
import { failAndRefund } from "./settle";
import type { FulfillmentOutcome } from "./types";

/**
 * Fulfill a stored-product order by claiming one item from inventory.
 *
 * The claim is atomic (via the claim_stock_item RPC with SKIP LOCKED) so two
 * concurrent orders cannot receive the same item.
 */
export async function fulfillStored(
  context: FulfillmentContext,
): Promise<FulfillmentOutcome> {
  const supabase = createSupabaseServiceClient();
  const attempt = await openAttempt(
    context,
    { product_id: context.externalProductId, qty: context.quantity },
    "stored",
  );

  if (!attempt) {
    return { state: "skipped", reason: "Could not open a fulfilment attempt." };
  }

  if (attempt.status === "completed") {
    return { state: "completed", deliveredItems: [] };
  }

  if (attempt.status === "refunded") {
    return { state: "failed", reason: "Previously refunded.", refunded: true };
  }

  if (!context.offerId) {
    return failAndRefund(context, attempt.id, "The stored offer is no longer available.");
  }

  let deliveredItems: string[];

  try {
    deliveredItems = await claimStockItems(
      supabase,
      context.offerId,
      context.orderId,
      context.quantity,
    );
  } catch {
    return failAndRefund(context, attempt.id, "The requested stock is no longer available.");
  }

  await recordAttempt(attempt.id, {
    status: "completed",
    delivered: { items: deliveredItems },
  });
  await setOrderStatus(context.orderId, "completed");

  // Nudge the owner when a stored offer is about to run out.
  try {
    const { data: remaining } = await supabase.rpc("count_stock", { p_offer_id: context.offerId });
    const count = typeof remaining === "number" ? remaining : Number(remaining ?? 0);
    if (Number.isFinite(count) && count <= 3) {
      await enqueueTelegramAlert({
        type: "low_stock",
        dedupKey: `low_stock:${context.offerId}:${count}`,
        payload: { offer_id: context.offerId, remaining: count },
      });
    }
  } catch {
    // Alerting never blocks delivery.
  }

  return { state: "completed", deliveredItems };
}
