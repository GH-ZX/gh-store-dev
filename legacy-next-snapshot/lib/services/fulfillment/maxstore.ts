import { MaxStoreClient } from "@/providers/maxstore/client";
import { MAXSTORE_PROVIDER_NAME } from "@/providers/maxstore/mapping";
import { classifyOrderStatus as classifyMaxStoreOrder } from "@/providers/maxstore/schemas";
import type { FulfillmentContext } from "./context";
import { providerIdempotencyKey } from "./context";
import { POLL_ATTEMPTS, POLL_DELAY_MS, delay, openAttempt, recordAttempt, setOrderStatus } from "./attempts";
import { describe, failAndRefund, handlePurchaseError } from "./settle";
import type { FulfillmentOutcome } from "./types";

/**
 * Buy through MaxStore.
 *
 * The supplier holds the idempotency rather than the store: `order_uuid` is the
 * order item's id, so a retry — from a checkout that timed out, an operator, or
 * the sweep — returns the original order instead of buying a second time. That
 * is why the key must never be freshly generated per attempt.
 *
 * There is no callback to wait for. MaxStore documents no webhook at all, so
 * polling `/check` is not a fallback here the way it is for G2Bulk; it is the
 * only mechanism, and an order left `processing` genuinely waits for the sweep.
 */
export async function fulfillMaxStore(
  context: FulfillmentContext,
  apiToken: string,
): Promise<FulfillmentOutcome> {
  if (!context.externalProductId) {
    return { state: "skipped", reason: "This offer is not mapped to a provider product." };
  }

  const client = new MaxStoreClient({ apiToken });
  const orderUuid = providerIdempotencyKey(context.orderItemId);
  const attempt = await openAttempt(
    context,
    { product_id: context.externalProductId, qty: context.quantity },
    MAXSTORE_PROVIDER_NAME,
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

  await setOrderStatus(context.orderId, "fulfilling");

  if (!attempt.externalOrderId && attempt.ownsPurchaseClaim) {
    try {
      const placed = await client.placeOrder({
        productId: context.externalProductId,
        quantity: context.quantity,
        orderUuid,
        // Whatever the customer filled in for this product. MaxStore refuses an
        // order with a field missing (code 106), which is the right failure:
        // better a refund than a delivery to the wrong account.
        params: context.dynamicFields,
      });

      await recordAttempt(attempt.id, {
        status: "processing",
        externalOrderId: placed.orderId,
        response: placed,
      });

      const state = classifyMaxStoreOrder(placed.status);

      if (state === "completed") {
        await recordAttempt(attempt.id, { status: "completed" });
        await setOrderStatus(context.orderId, "completed");

        return { state: "completed", deliveredItems: [] };
      }

      if (state === "failed") {
        return failAndRefund(context, attempt.id, "The supplier rejected this order.");
      }
    } catch (error) {
      return handlePurchaseError(context, attempt.id, error);
    }
  }

  for (let round = 0; round < POLL_ATTEMPTS; round += 1) {
    await delay(POLL_DELAY_MS);

    try {
      const [result] = await client.checkOrders([orderUuid]);

      if (!result) {
        continue;
      }

      const state = classifyMaxStoreOrder(result.status);

      if (state === "completed") {
        await recordAttempt(attempt.id, {
          status: "completed",
          response: result,
          // Whatever the supplier hands over — codes, an account, a note. Stored
          // the moment it arrives, because this may be the only copy.
          delivered: result.delivery ? { items: result.delivery } : undefined,
        });
        await setOrderStatus(context.orderId, "completed");

        return { state: "completed", deliveredItems: [] };
      }

      if (state === "failed") {
        return failAndRefund(context, attempt.id, "The supplier could not complete this order.");
      }
    } catch (error) {
      const detail = describe(error);
      await recordAttempt(attempt.id, {
        status: "processing",
        errorMessage: detail.customer,
        errorCode: detail.code,
      });
    }
  }

  await recordAttempt(attempt.id, { status: "processing" });

  return { state: "processing" };
}
