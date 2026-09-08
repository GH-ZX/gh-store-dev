import { G2BulkFulfillmentClient } from "@/providers/g2bulk/client";
import { classifyProviderStatus } from "@/providers/g2bulk/fulfillment-schemas";
import type { Json } from "@/types/database";
import { logFailure } from "@/lib/logging/logger";
import type { FulfillmentContext } from "./context";
import { providerIdempotencyKey } from "./context";
import {
  POLL_ATTEMPTS,
  POLL_DELAY_MS,
  delay,
  openAttempt,
  recordAttempt,
  setOrderStatus,
} from "./attempts";
import { describe, failAndRefund, handlePurchaseError } from "./settle";
import type { FulfillmentOutcome } from "./types";

/** The G2Bulk flows: the UID top-up, and the redeem-code card. */

/** Live supplier cost, re-read immediately before buying. */
async function currentSupplierCost(
  client: G2BulkFulfillmentClient,
  context: FulfillmentContext,
): Promise<number | null> {
  if (!context.gameCode || !context.catalogueName) {
    return null;
  }

  try {
    const catalogue = await client.getGameCatalogue(context.gameCode);
    const item = catalogue.catalogues.find((entry) => entry.name === context.catalogueName);

    return item?.amount ?? null;
  } catch (error) {
    // Returning null makes the order fail and refund, so the reason matters.
    logFailure("fulfilment", "supplier_cost_unreadable", error, {
      orderId: context.orderId,
      game: context.gameCode,
    });
    return null;
  }
}

export async function fulfillTopup(
  client: G2BulkFulfillmentClient,
  context: FulfillmentContext,
  callbackUrl: string | null,
): Promise<FulfillmentOutcome> {
  if (!context.gameCode || !context.catalogueName) {
    return { state: "skipped", reason: "This offer is not mapped to a provider product." };
  }

  const playerId =
    context.dynamicFields.userid ??
    context.dynamicFields.user_id ??
    context.dynamicFields.playerid ??
    context.dynamicFields.player_id ??
    "";
  const serverId = context.dynamicFields.serverid ?? context.dynamicFields.server_id ?? undefined;
  const charname = context.dynamicFields.charname ?? undefined;

  if (!playerId) {
    return { state: "skipped", reason: "The order carries no player id." };
  }

  const requestPayload: Record<string, Json> = {
    game: context.gameCode,
    catalogue_name: context.catalogueName,
    player_id: playerId,
    ...(serverId ? { server_id: serverId } : {}),
    ...(charname ? { charname } : {}),
  };

  const attempt = await openAttempt(context, requestPayload);

  if (!attempt) {
    return { state: "skipped", reason: "Could not open a fulfilment attempt." };
  }

  // Already settled by an earlier run.
  if (attempt.status === "completed") {
    return { state: "completed", deliveredItems: [] };
  }

  if (attempt.status === "refunded") {
    return { state: "failed", reason: "Previously refunded.", refunded: true };
  }

  await setOrderStatus(context.orderId, "fulfilling");

  // Validate the player before spending anything: a wrong id is the most common
  // reason a top-up fails, and it is cheaper to catch here.
  try {
    const check = await client.checkPlayer({
      game: context.gameCode,
      userId: playerId,
      serverId,
      charname,
    });

    if (!check.valid) {
      return failAndRefund(context, attempt.id, "The game rejected these account details.");
    }
  } catch (error) {
    // A validation outage is not proof the player is wrong, so this does not
    // fail the order on its own — the order attempt below is the real test.
    const detail = describe(error);
    await recordAttempt(attempt.id, {
      status: "processing",
      errorMessage: detail.customer,
      errorCode: detail.code,
    });
  }

  const cost = await currentSupplierCost(client, context);

  if (cost === null) {
    return failAndRefund(context, attempt.id, "The supplier no longer lists this package.");
  }

  let externalOrderId = attempt.externalOrderId;

  if (!externalOrderId && attempt.ownsPurchaseClaim) {
    try {
      const placed = await client.placeGameOrder(
        context.gameCode,
        {
          ...requestPayload,
          catalogue_name: context.catalogueName,
          player_id: playerId,
          // The store's own order number, so a supplier-side query can be traced
          // back. Never the customer's price.
          remark: context.orderNumber,
          /*
           * Where to report the outcome. Polling below still runs — the supplier
           * often finishes inside checkout's own window, and an order that
           * settles in front of the customer should not wait for a round trip
           * back through the callback.
           */
          ...(callbackUrl ? { callback_url: callbackUrl } : {}),
        },
        providerIdempotencyKey(context.orderItemId),
      );

      externalOrderId = String(placed.order.order_id);
      await recordAttempt(attempt.id, {
        status: "processing",
        externalOrderId,
        response: placed,
      });

      if (classifyProviderStatus(placed.order.status) === "completed") {
        await recordAttempt(attempt.id, { status: "completed", externalOrderId });
        await setOrderStatus(context.orderId, "completed");

        return { state: "completed", deliveredItems: [] };
      }
    } catch (error) {
      return handlePurchaseError(context, attempt.id, error);
    }
  }

  // A concurrent worker that did not win the purchase claim must not call the
  // provider with an unknown order id. The winner will leave the external id for
  // the next reconciliation pass if this request returns first.
  if (!externalOrderId) {
    return { state: "processing" };
  }

  // Poll a bounded number of times. Staying `processing` is a correct answer:
  // the supplier may finish minutes later, and refunding now would give away the
  // goods for free.
  for (let round = 0; round < POLL_ATTEMPTS; round += 1) {
    await delay(POLL_DELAY_MS);

    try {
      const status = await client.findGameOrderStatus(externalOrderId);

      if (!status) {
        continue;
      }

      const state = classifyProviderStatus(status.status);

      if (state === "completed" && !status.refunded) {
        await recordAttempt(attempt.id, { status: "completed", response: status });
        await setOrderStatus(context.orderId, "completed");

        return { state: "completed", deliveredItems: [] };
      }

      if (state === "failed" || status.refunded) {
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

export async function fulfillVoucher(
  client: G2BulkFulfillmentClient,
  context: FulfillmentContext,
): Promise<FulfillmentOutcome> {
  if (!context.externalProductId) {
    return { state: "skipped", reason: "This card is not mapped to a provider product." };
  }

  const attempt = await openAttempt(context, {
    product_id: context.externalProductId,
    quantity: context.quantity,
  });

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

  let externalOrderId = attempt.externalOrderId;

  if (!externalOrderId && attempt.ownsPurchaseClaim) {
    try {
      const purchase = await client.purchaseVoucher(
        context.externalProductId,
        context.quantity,
        providerIdempotencyKey(context.orderItemId),
      );

      externalOrderId = String(purchase.order_id);
      const items = purchase.delivery_items ?? [];

      if (items.length > 0) {
        // Codes must be persisted the moment they arrive: the provider keeps them
        // for 30 days, and this is the only copy the customer will ever get.
        await recordAttempt(attempt.id, {
          status: "completed",
          externalOrderId,
          response: purchase,
          delivered: { items },
        });
        await setOrderStatus(context.orderId, "completed");

        return { state: "completed", deliveredItems: items };
      }

      await recordAttempt(attempt.id, {
        status: "processing",
        externalOrderId,
        response: purchase,
      });
    } catch (error) {
      return handlePurchaseError(context, attempt.id, error);
    }
  }

  if (!externalOrderId) {
    return { state: "processing" };
  }

  for (let round = 0; round < POLL_ATTEMPTS; round += 1) {
    await delay(POLL_DELAY_MS);

    try {
      const result = await client.pollVoucherDelivery(externalOrderId);

      if (result.state === "delivered") {
        await recordAttempt(attempt.id, {
          status: "completed",
          delivered: { items: result.items },
        });
        await setOrderStatus(context.orderId, "completed");

        return { state: "completed", deliveredItems: result.items };
      }

      if (result.state === "failed") {
        // A 410 means the provider already refunded its side; ours still has to
        // return the customer's money.
        return failAndRefund(context, attempt.id, "The supplier could not deliver this card.");
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

  return { state: "processing" };
}
