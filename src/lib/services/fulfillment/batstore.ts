import { BatStoreClient } from "@/providers/batstore/client";
import { BATSTORE_PROVIDER_NAME } from "@/providers/batstore/mapping";
import { classifyOrderStatus as classifyBatStoreOrder } from "@/providers/batstore/schemas";
import type { FulfillmentContext } from "./context";
import { providerIdempotencyKey } from "./context";
import { POLL_ATTEMPTS, POLL_DELAY_MS, delay, openAttempt, recordAttempt, setOrderStatus } from "./attempts";
import { describe, failAndRefund, handlePurchaseError } from "./settle";
import type { FulfillmentOutcome } from "./types";

/** The delivered account data as stored payload and customer-readable codes. */
export function deliveredItems(order: {
  items: { id: string; accountData: unknown }[];
}): { payload: { items: string[] }; codes: string[] } {
  const items = order.items.map((item) => {
    if (typeof item.accountData === "string") {
      return item.accountData.trim() || item.id;
    }

    // An object-shaped account is kept whole, since it may carry several fields.
    return item.accountData === null || item.accountData === undefined
      ? item.id
      : JSON.stringify(item.accountData);
  });

  return { payload: { items }, codes: items };
}

/**
 * Buy through BatStore.
 *
 * The supplier holds the idempotency rather than the store: `idempotency_key` is
 * the order item's id, so a retry — from a checkout that timed out, an operator,
 * or the sweep — returns the original order instead of buying a second time.
 *
 * Delivery is `items[].account_data` appearing on the order, which is checked by
 * polling `GET /orders/{id}`. BatStore documents no webhook, so polling is not a
 * fallback here the way it is for G2Bulk; it is the only mechanism, and an order
 * left `processing` genuinely waits for the sweep.
 */
export async function fulfillBatStore(
  context: FulfillmentContext,
  apiToken: string,
): Promise<FulfillmentOutcome> {
  if (!context.externalProductId) {
    return { state: "skipped", reason: "This offer is not mapped to a provider product." };
  }

  const activationIdentifier =
    context.dynamicFields.activation_identifier ??
    context.dynamicFields.activationIdentifier ??
    "";

  /*
   * Only goods that land on an account need an identifier. `direct` products —
   * BatStore's `stock` type, the majority of its live catalog — are pre-purchased
   * and delivered as-is: a code, an account, or an activation link. Demanding an
   * identifier from their buyers was a wall between them and the buy.
   */
  if (!activationIdentifier && context.deliveryKind !== "direct") {
    return { state: "skipped", reason: "The order carries no activation identifier." };
  }

  const client = new BatStoreClient(apiToken);
  const idempotencyKey = providerIdempotencyKey(context.orderItemId);
  const attempt = await openAttempt(
    context,
    {
      product_id: context.externalProductId,
      quantity: context.quantity,
      ...(activationIdentifier ? { activation_identifier: activationIdentifier } : {}),
    },
    BATSTORE_PROVIDER_NAME,
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
      const placed = await client.createOrder({
        productId: context.externalProductId,
        quantity: context.quantity,
        activationIdentifier: activationIdentifier || undefined,
        idempotencyKey,
        customerReference: context.orderNumber,
      });

      await recordAttempt(attempt.id, {
        status: "processing",
        externalOrderId: placed.id || null,
        response: placed,
      });

      const state = classifyBatStoreOrder(placed);

      if (state === "completed") {
        const delivered = deliveredItems(placed);

        await recordAttempt(attempt.id, {
          status: "completed",
          externalOrderId: placed.id || null,
          delivered: delivered.payload,
        });
        await setOrderStatus(context.orderId, "completed");

        return { state: "completed", deliveredItems: delivered.codes };
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
      const result = await client.getOrder(attempt.externalOrderId ?? "");

      if (!result.id) {
        continue;
      }

      const state = classifyBatStoreOrder(result);

      if (state === "completed") {
        const delivered = deliveredItems(result);

        await recordAttempt(attempt.id, {
          status: "completed",
          response: result,
          // Whatever the supplier hands over — an account, a code, a note. Stored
          // the moment it arrives, because this may be the only copy.
          delivered: delivered.payload,
        });
        await setOrderStatus(context.orderId, "completed");

        return { state: "completed", deliveredItems: delivered.codes };
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
