import { G2BulkError } from "@/providers/g2bulk/errors";
import { MaxStoreError } from "@/providers/maxstore/errors";
import { BatStoreError } from "@/providers/batstore/errors";
import { readRefundOnFulfillmentFailure } from "@/lib/settings/fulfillment-settings";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { log, logFailure } from "@/lib/logging/logger";
import { notify } from "@/lib/services/notification.service";
import { enqueueTelegramAlert } from "@/lib/services/telegram-alerts.service";
import type { FulfillmentContext } from "./context";
import { recordAttempt, setOrderStatus } from "./attempts";
import type { FulfillmentOutcome } from "./types";

/**
 * Settling an order the customer can see: turning a provider's answer into a
 * failed order, a refund, and the messages both audiences receive.
 */

/**
 * Split a failure into what the customer reads and what an operator needs.
 *
 * The provider's own wording ("Invalid player ID. Please check and try again.")
 * is genuinely useful to a shopper, but our internal classification is not — a
 * refund note reading "request: Invalid player ID" leaks jargon onto the
 * customer's order page. The kind is kept alongside in `error_code`, where an
 * operator can still see it.
 */
export function describe(error: unknown): { customer: string; code: string | null } {
  if (error instanceof G2BulkError || error instanceof MaxStoreError || error instanceof BatStoreError) {
    const provider = error.message.trim();
    // Only a rejected request or a rejected key carries a message meant for a
    // person; a network or contract fault is machine detail.
    const usable = error.kind === "request" || error.kind === "auth" ? provider : "";

    return {
      customer: usable || "The supplier could not complete this order.",
      code: error.kind,
    };
  }

  return {
    customer: "The supplier could not complete this order.",
    code: error instanceof Error ? error.name : null,
  };
}

/**
 * A failed purchase request is not always a failed purchase. Network, server,
 * rate-limit, and contract errors can happen after the supplier accepted the
 * order but before our server received the response. Never refund or retry that
 * ambiguous case automatically; the stable provider key lets reconciliation
 * look up the original order safely.
 */
export async function handlePurchaseError(
  context: FulfillmentContext,
  attemptId: string,
  error: unknown,
): Promise<FulfillmentOutcome> {
  const detail = describe(error);
  const explicitRejection =
    (error instanceof G2BulkError || error instanceof MaxStoreError || error instanceof BatStoreError) &&
    (error.kind === "request" || error.kind === "auth");

  if (!explicitRejection) {
    await recordAttempt(attemptId, {
      status: "processing",
      errorMessage: detail.customer,
      errorCode: detail.code,
    });
    return { state: "processing" };
  }

  return failAndRefund(context, attemptId, detail.customer, detail.code);
}

/**
 * Settle a terminal failure: mark the order failed, then follow the owner's
 * refund policy. The refund RPC is idempotent, so a repeated settlement returns
 * the same result rather than crediting twice.
 *
 * A gift order has no wallet to credit — nothing was ever debited — so the
 * refund step is skipped for it. The order still goes `failed` (the delivery did
 * not happen), and the customer-facing copy correctly says nothing was returned.
 */
export async function failAndRefund(
  context: FulfillmentContext,
  attemptId: string,
  reason: string,
  code: string | null = null,
): Promise<FulfillmentOutcome> {
  const supabase = createSupabaseServiceClient();

  await recordAttempt(attemptId, { status: "failed", errorMessage: reason, errorCode: code });
  await setOrderStatus(context.orderId, "failed");

  if (context.paymentMethod === "gift") {
    return { state: "failed", reason, refunded: false };
  }

  /*
   * The owner can choose to investigate a failed order before returning money.
   * Missing or unreadable settings deliberately choose the safer refund path;
   * only an explicit `false` keeps the customer charge in place.
   */
  const { data: settings } = await supabase
    .from("store_settings")
    .select("payments")
    .eq("id", "global")
    .maybeSingle();

  if (!readRefundOnFulfillmentFailure(settings?.payments ?? {})) {
    log.warn("fulfilment", "order_failed_without_refund", {
      orderId: context.orderId,
      orderNumber: context.orderNumber,
      reason,
    });

    return { state: "failed", reason, refunded: false };
  }

  const { error } = await supabase.rpc("refund_failed_order", {
    p_order_id: context.orderId,
    p_reason: reason,
    // Distinct from the purchase key, and stable, so a retry refunds once.
    p_idempotency_key: context.orderItemId,
  });

  if (error) {
    /*
     * The order stays `failed` with the money still debited. This is the single
     * worst state the store can be in — a customer charged for nothing — so it
     * is logged at error level even though the function returns normally.
     */
    logFailure("fulfilment", "refund_failed", error, {
      orderId: context.orderId,
      orderNumber: context.orderNumber,
      reason,
    });

    return { state: "failed", reason, refunded: false };
  }

  await recordAttempt(attemptId, { status: "refunded", errorMessage: reason, errorCode: code });

  log.info("fulfilment", "order_refunded", {
    orderId: context.orderId,
    orderNumber: context.orderNumber,
    reason,
  });

  return { state: "failed", reason, refunded: true };
}

/**
 * Tell the customer how it went.
 *
 * At this boundary rather than inside each branch, so every caller — a checkout
 * and an operator's retry alike — produces exactly one message per outcome. It
 * only speaks for terminal states: a `pending` order has nothing to report yet,
 * and `skipped` is a configuration problem for the owner, not news for a customer.
 *
 * `notify` cannot throw, so a notification failure leaves the delivery alone.
 */
export async function announceOutcome(
  context: FulfillmentContext,
  outcome: FulfillmentOutcome,
): Promise<void> {
  if (outcome.state !== "completed" && outcome.state !== "failed") {
    return;
  }

  const supabase = createSupabaseServiceClient();
  const { data: order } = await supabase
    .from("orders")
    .select("user_id")
    .eq("id", context.orderId)
    .maybeSingle();

  if (!order) {
    return;
  }

  // Stored without a locale prefix; the page that renders it adds the reader's.
  const href = `/orders/${context.orderId}`;

  if (outcome.state === "completed") {
    await notify({
      userId: order.user_id,
      type: "order_delivered",
      titleAr: "تم تنفيذ طلبك",
      titleEn: "Your order is delivered",
      bodyAr: `طلب ${context.orderNumber} جاهز. افتح الطلب لعرض التفاصيل.`,
      bodyEn: `Order ${context.orderNumber} is ready. Open it to see the details.`,
      href,
      entityType: "order",
      entityId: context.orderId,
    });

    await enqueueTelegramAlert({
      type: "order_delivered",
      payload: {
        order_id: context.orderId,
        order_number: context.orderNumber,
        quantity: context.quantity,
      },
    });
    await enqueueTelegramAlert({
      type: "order_delivered",
      userId: order.user_id,
      payload: {
        order_id: context.orderId,
        order_number: context.orderNumber,
        quantity: context.quantity,
      },
    });
    return;
  }

  /*
   * The refund is the part the customer cares about, so it leads. `outcome.reason`
   * is already the provider's customer-facing wording — the jargon went to
   * `error_code` — so it is safe to repeat here.
   */
  await enqueueTelegramAlert({
    type: "order_failed",
    payload: {
      order_id: context.orderId,
      order_number: context.orderNumber,
      quantity: context.quantity,
      reason: outcome.reason,
      refunded: outcome.refunded,
    },
  });

  // And the customer whose order this is, when their chat is linked.
  await enqueueTelegramAlert({
    type: "order_failed",
    userId: order.user_id,
    payload: {
      order_id: context.orderId,
      order_number: context.orderNumber,
      reason: outcome.reason,
      refunded: outcome.refunded,
    },
  });

  await notify({
    userId: order.user_id,
    type: "order_failed",
    titleAr: outcome.refunded ? "تعذّر تنفيذ طلبك وأعدنا المبلغ" : "تعذّر تنفيذ طلبك",
    titleEn: outcome.refunded ? "Your order failed and was refunded" : "Your order failed",
    bodyAr: outcome.refunded
      ? `طلب ${context.orderNumber}: ${outcome.reason} أعدنا المبلغ إلى محفظتك.`
      : `طلب ${context.orderNumber}: ${outcome.reason} تواصل معنا وسنعالج الأمر.`,
    bodyEn: outcome.refunded
      ? `Order ${context.orderNumber}: ${outcome.reason} The amount is back in your wallet.`
      : `Order ${context.orderNumber}: ${outcome.reason} Contact us and we will sort it out.`,
    href,
    entityType: "order",
    entityId: context.orderId,
  });
}
