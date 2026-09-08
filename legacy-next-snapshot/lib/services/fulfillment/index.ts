import { G2BulkFulfillmentClient } from "@/providers/g2bulk/client";
import { classifyProviderStatus } from "@/providers/g2bulk/fulfillment-schemas";
import { G2BULK_PROVIDER_NAME } from "@/providers/g2bulk/mapping";
import {
  decideReconciliation,
  GRACE_MINUTES,
  minutesSince,
  type ProviderState,
} from "@/lib/orders/reconciliation-policy";
import { MaxStoreClient } from "@/providers/maxstore/client";
import { MAXSTORE_PROVIDER_NAME } from "@/providers/maxstore/mapping";
import { classifyOrderStatus as classifyMaxStoreOrder } from "@/providers/maxstore/schemas";
import { BatStoreClient } from "@/providers/batstore/client";
import { BATSTORE_PROVIDER_NAME } from "@/providers/batstore/mapping";
import { classifyOrderStatus as classifyBatStoreOrder } from "@/providers/batstore/schemas";
import { createSupabaseServiceClient, hasServiceRoleKey } from "@/lib/supabase/service";
import { log } from "@/lib/logging/logger";
import {
  loadContext,
  providerIdempotencyKey,
  readBatStoreToken,
  readCallbackUrl,
  readCredentials,
  readMaxStoreToken,
} from "./context";
import { recordAttempt, setOrderStatus } from "./attempts";
import { announceOutcome, describe, failAndRefund } from "./settle";
import { fulfillTopup, fulfillVoucher } from "./g2bulk";
import { fulfillMaxStore } from "./maxstore";
import { deliveredItems, fulfillBatStore } from "./batstore";
import { fulfillStored } from "./stored";
import type { FulfillmentOutcome, ReconcileOutcome } from "./types";

/**
 * Fulfilment.
 *
 * Runs with service authority, never under the customer's session. Advancing a
 * fulfilment and refunding a failure are the worker's decisions; if a shopper's
 * session could make them, a shopper could claim a refund on an order the
 * supplier actually delivered.
 *
 * The rules that keep money and goods in agreement:
 *
 *   * The supplier cost is re-read immediately before buying. Provider prices
 *     move with exchange rates, and the cost recorded at import time is a stale
 *     snapshot.
 *   * A purchase carries a 36-character idempotency key derived from the order
 *     item, so a retry within the provider's 30-minute window returns the
 *     original result instead of buying twice.
 *   * `pending` is not failure. An order that is still processing stays
 *     `fulfilling` and is never refunded, because refunding something the
 *     supplier later delivers loses the money outright.
 *   * A terminal failure refunds exactly once, through a service-role RPC that
 *     is itself idempotent.
 *   * The customer price is never sent to the provider.
 *
 * The module is split by concern: `context.ts` loads the order and the stored
 * provider keys, `attempts.ts` owns the attempt row and status writes,
 * `settle.ts` turns failures into refunds and messages, one file per supplier
 * flow, and this file holds the two entry points that route between them.
 */

/**
 * Fulfil a paid order.
 *
 * Safe to call more than once: the attempt row and the provider's own
 * idempotency window both make a repeat a no-op rather than a second purchase.
 */
export async function fulfillOrder(orderId: string): Promise<FulfillmentOutcome> {
  if (!hasServiceRoleKey()) {
    return {
      state: "skipped",
      reason: "SUPABASE_SERVICE_ROLE_KEY is not configured, so fulfilment cannot run.",
    };
  }

  const context = await loadContext(orderId);

  if (!context) {
    return { state: "skipped", reason: "Order not found." };
  }

  // Manual: admin handles externally — skip automated fulfillment.
  if (context.deliveryKind === "manual") {
    return { state: "skipped", reason: "Manual order — awaiting admin completion." };
  }

  // Stored: claim one item from stock inventory.
  if (context.deliveryKind === "stored") {
    const outcome = await fulfillStored(context);
    await announceOutcome(context, outcome);
    return outcome;
  }

  if (context.providerName === MAXSTORE_PROVIDER_NAME) {
    const apiToken = await readMaxStoreToken();

    if (!apiToken) {
      return { state: "skipped", reason: "The MaxStore provider is not configured." };
    }

    const outcome = await fulfillMaxStore(context, apiToken);

    await announceOutcome(context, outcome);

    return outcome;
  }

  if (context.providerName === BATSTORE_PROVIDER_NAME) {
    const apiToken = await readBatStoreToken();

    if (!apiToken) {
      return { state: "skipped", reason: "The BatStore provider is not configured." };
    }

    const outcome = await fulfillBatStore(context, apiToken);

    await announceOutcome(context, outcome);

    return outcome;
  }

  const apiKey = await readCredentials();

  if (!apiKey) {
    return { state: "skipped", reason: "The G2Bulk provider is not configured." };
  }

  const client = new G2BulkFulfillmentClient({ apiKey });
  const outcome =
    context.offerType === "topup"
      ? // Only top-ups have a callback: the supplier documents one for game
        // orders and not for card purchases, which deliver their codes inline.
        await fulfillTopup(client, context, await readCallbackUrl())
      : await fulfillVoucher(client, context);

  await announceOutcome(context, outcome);

  return outcome;
}

/**
 * Settle an order the supplier never finished in front of the customer.
 *
 * Checkout gives the supplier about ten seconds and then leaves the order at
 * `fulfilling`; this is what eventually goes back and asks how it turned out.
 *
 * It never buys. The purchase path is reached only from checkout and from an
 * operator's explicit retry, both of which a person is waiting on. A background
 * sweep that could place an order would be one bug away from buying a second
 * time for every order it looked at, so it is not given the option: when there
 * is no supplier order to poll, the answer is a question for a human rather
 * than a purchase or a refund.
 */
export async function reconcileOrder(orderId: string, now = Date.now()): Promise<ReconcileOutcome> {
  if (!hasServiceRoleKey()) {
    return { action: "skipped", reason: "Service role key is not configured." };
  }

  const context = await loadContext(orderId);

  if (!context) {
    return { action: "skipped", reason: "Order not found." };
  }

  const supabase = createSupabaseServiceClient();
  const provider = context.providerName ?? G2BULK_PROVIDER_NAME;
  const { data: attempt } = await supabase
    .from("fulfillment_attempts")
    .select("id, status, external_order_id, created_at")
    .eq("provider", provider)
    .eq("idempotency_key", providerIdempotencyKey(context.orderItemId))
    .maybeSingle();

  if (!attempt) {
    // Nothing was ever attempted, so nothing was bought and nothing is owed to
    // the supplier. A `paid` order in this state is one the bot placed: the
    // customer has paid and the supplier was never asked, so ask now. The
    // purchase path is idempotent per order item, and the sweep runs after the
    // grace period, so this cannot double-buy.
    if (context.status === "paid") {
      const outcome = await fulfillOrder(orderId);

      return outcome.state === "completed"
        ? { action: "completed", reason: "Fulfilled by the reconciliation sweep." }
        : {
            action: "escalated",
            reason: `Fulfilment was attempted by the sweep but did not complete (${outcome.state}).`,
          };
    }

    // A non-paid order that was never attempted has no money to reconcile; a
    // person decides what it is.
    return { action: "escalated", reason: "No fulfilment was ever attempted for this order." };
  }

  if (attempt.status === "completed" || attempt.status === "refunded") {
    return { action: "skipped", reason: "Already settled." };
  }

  // `processing` without a provider id means a worker may have timed out after
  // submitting the purchase but before saving its response. Never issue another
  // purchase in this ambiguous state; leave it for manual provider lookup.
  if (attempt.status === "processing" && !attempt.external_order_id) {
    log.warn("fulfilment", "purchase_claim_ambiguous", {
      orderId: context.orderId,
      orderNumber: context.orderNumber,
      provider,
    });
    return { action: "escalated", reason: "A purchase may be in progress without a supplier reference." };
  }

  const ageMinutes = minutesSince(attempt.created_at, now);

  /*
   * Ask the supplier first, but only when there is something to ask about. The
   * policy needs the answer to decide, and a missing supplier id short-circuits
   * to escalation without spending a request.
   */
  let providerState: ProviderState = null;
  let refunded = false;
  let deliveredPayload: { items: string[] } | undefined;

  if (attempt.external_order_id && ageMinutes >= GRACE_MINUTES) {
    /*
     * Ask whichever supplier actually holds this order. For MaxStore this poll
     * is not a backstop but the only way an order ever settles — it publishes no
     * callback — so a sweep that asked the wrong provider would strand every one
     * of its orders at `fulfilling` for ever.
     */
    const credentials =
      provider === MAXSTORE_PROVIDER_NAME
        ? await readMaxStoreToken()
        : provider === BATSTORE_PROVIDER_NAME
          ? await readBatStoreToken()
          : await readCredentials();

    if (!credentials) {
      return { action: "skipped", reason: "That supplier is not configured." };
    }

    try {
      if (provider === MAXSTORE_PROVIDER_NAME) {
        // Keyed by our own uuid, which is what MaxStore knows the order as.
        const [result] = await new MaxStoreClient({ apiToken: credentials }).checkOrders([
          providerIdempotencyKey(context.orderItemId),
        ]);
        // MaxStore's own words map straight onto the policy's: `wait` is
        // pending, and pending never settles an order either way.
        providerState = result ? classifyMaxStoreOrder(result.status) : null;
        if (providerState === "completed" && result?.delivery) {
          const delivery = result.delivery;
          const items = Array.isArray(delivery)
            ? delivery.map((item) => (typeof item === "string" ? item : JSON.stringify(item)))
            : typeof delivery === "string"
              ? [delivery]
              : [];
          deliveredPayload = { items };
        }
      } else if (provider === BATSTORE_PROVIDER_NAME) {
        const result = await new BatStoreClient(credentials).getOrder(attempt.external_order_id);
        providerState = result ? classifyBatStoreOrder(result) : null;
        // The account data arrives on the order itself, so the sweep is where it
        // is first seen for an order the checkout window could not wait for.
        if (providerState === "completed" && result) {
          deliveredPayload = deliveredItems(result).payload;
        }
      } else {
        const client = new G2BulkFulfillmentClient({ apiKey: credentials });

        if (context.offerType === "topup") {
          const status = await client.findGameOrderStatus(attempt.external_order_id);

          providerState = status ? classifyProviderStatus(status.status) : null;
          refunded = status?.refunded === true;
        } else {
          // Voucher delivery is a separate endpoint. The game-order history only
          // tells us a purchase finished; it does not carry the codes the customer
          // paid for, so using it here could complete an order with no delivery.
          const delivery = await client.pollVoucherDelivery(attempt.external_order_id);

          providerState =
            delivery.state === "delivered"
              ? "completed"
              : delivery.state === "failed"
                ? "failed"
                : delivery.state === "missing"
                  ? null
                  : "pending";
          refunded = delivery.state === "failed";

          if (providerState === "completed") {
            deliveredPayload = { items: delivery.items };
          }
        }
      }
    } catch (error) {
      // An unreachable supplier is not an answer about the order. Record why the
      // check failed and leave the order where it is.
      const detail = describe(error);
      await recordAttempt(attempt.id, {
        status: attempt.status === "pending" ? "pending" : "processing",
        errorMessage: detail.customer,
        errorCode: detail.code,
      });

      return { action: "wait", reason: detail.customer };
    }
  }

  const decision = decideReconciliation({
    providerState,
    refunded,
    hasExternalOrderId: Boolean(attempt.external_order_id),
    ageMinutes,
  });

  if (decision.action === "wait") {
    return { action: "wait" };
  }

  if (decision.action === "complete") {
    const requiresDeliveryPayload =
      context.deliveryKind === "stored" ||
      context.offerType !== "topup";

    if (requiresDeliveryPayload && (!deliveredPayload || deliveredPayload.items.length === 0)) {
      log.warn("fulfilment", "provider_completed_without_delivery", {
        orderId: context.orderId,
        orderNumber: context.orderNumber,
        provider,
      });
      return { action: "escalated", reason: "Supplier completed the order without delivery data." };
    }

    await recordAttempt(attempt.id, {
      status: "completed",
      ...(deliveredPayload ? { delivered: deliveredPayload } : {}),
    });
    await setOrderStatus(context.orderId, "completed");
    await announceOutcome(context, { state: "completed", deliveredItems: deliveredPayload?.items ?? [] });

    return { action: "completed" };
  }

  if (decision.action === "fail") {
    const outcome = await failAndRefund(context, attempt.id, decision.reason);
    await announceOutcome(context, outcome);

    // `failAndRefund` settles a failure, so only the `failed` state is possible
    // here; the narrowed access below is what the typechecker can prove.
    const refunded = outcome.state === "failed" ? outcome.refunded : false;

    return refunded
      ? { action: "refunded", reason: decision.reason }
      : {
          action: "escalated",
          reason: "The supplier failed and this order needs a manual refund decision.",
        };
  }

  /*
   * `reconcile` is the state the schema has always declared and nothing has ever
   * written: the supplier's answer does not settle this, and guessing either way
   * risks giving away goods or taking money for nothing. The order stays as it
   * is, and the dashboard already renders this state as needing attention.
   */
  await recordAttempt(attempt.id, { status: "reconcile", errorMessage: decision.reason });

  // Warn, not info: this one needs a person, and nobody is watching the order.
  log.warn("fulfilment", "order_escalated", {
    orderId: context.orderId,
    orderNumber: context.orderNumber,
    reason: decision.reason,
    ageMinutes: Math.round(ageMinutes),
    hasExternalOrderId: Boolean(attempt.external_order_id),
  });

  return { action: "escalated", reason: decision.reason };
}