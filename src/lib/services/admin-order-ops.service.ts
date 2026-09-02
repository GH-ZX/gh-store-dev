import "server-only";

import { requireAdmin } from "@/lib/auth/guards";
import { log } from "@/lib/logging/logger";
import { isSettledOrderStatus } from "@/lib/orders/order-status";
import { recordAudit } from "@/lib/services/admin-audit.service";
import { fulfillOrder } from "@/lib/services/fulfillment.service";
import { notify } from "@/lib/services/notification.service";
import { createSupabaseServiceClient, hasServiceRoleKey } from "@/lib/supabase/service";

/**
 * The three things an operator can do to an order that is stuck.
 *
 * Both are narrow on purpose. An order is created by the checkout RPC and
 * delivered by the fulfilment worker; these exist for the cases those cannot
 * resolve on their own — a supplier that failed transiently, and a delivery the
 * owner completed by hand outside the system.
 *
 * Neither may ever hand over goods that have been paid back. A refunded order has
 * had its money returned, so delivering it would be a gift; a completed one has
 * already been delivered, so delivering again would be a second gift. Both states
 * are refused here, and the fulfilment worker refuses them independently — the
 * guard is deliberately duplicated because the cost of getting it wrong is giving
 * away stock.
 */

export class OrderOpError extends Error {
  readonly reason:
    | "not_found"
    | "already_delivered"
    | "not_delivered"
    | "refunded"
    | "not_refundable"
    | "not_configured"
    | "unknown";

  constructor(reason: OrderOpError["reason"], message: string) {
    super(message);
    this.name = "OrderOpError";
    this.reason = reason;
  }
}

type OrderRow = {
  id: string;
  order_number: string;
  status: string;
  payment_status: string;
  payment_method: string | null;
  user_id: string;
};

async function loadOrder(orderId: string): Promise<OrderRow> {
  if (!hasServiceRoleKey()) {
    throw new OrderOpError("not_configured", "SUPABASE_SERVICE_ROLE_KEY is not configured.");
  }

  const service = createSupabaseServiceClient();
  const { data } = await service
    .from("orders")
    .select("id, order_number, status, payment_status, payment_method, user_id")
    .eq("id", orderId)
    .maybeSingle();

  if (!data) {
    throw new OrderOpError("not_found", "Order not found.");
  }

  return data;
}

function audit(
  actorId: string,
  action: string,
  orderId: string,
  values: Record<string, unknown>,
): Promise<void> {
  return recordAudit({ actorId, action, entityType: "order", entityId: orderId, values });
}

export type RetryResult = {
  state: string;
  reason?: string;
  refunded?: boolean;
};

/**
 * Run the delivery again.
 *
 * The worker is idempotent per attempt — it holds the supplier's idempotency key,
 * so a retry cannot buy twice — and it re-reads the supplier cost before
 * spending. This wrapper adds only the operator-facing refusals and the audit
 * record.
 */
export async function retryFulfillment(orderId: string): Promise<RetryResult> {
  const admin = await requireAdmin();
  const order = await loadOrder(orderId);

  if (order.status === "completed") {
    throw new OrderOpError("already_delivered", "This order is already delivered.");
  }

  if (order.status === "refunded" || order.status === "cancelled") {
    throw new OrderOpError(
      "refunded",
      "This order was refunded, so delivering it now would give the goods away.",
    );
  }

  const outcome = await fulfillOrder(orderId);

  await audit(admin.id, "order.retry_fulfillment", orderId, {
    order_number: order.order_number,
    outcome: outcome.state,
    ...("reason" in outcome && outcome.reason ? { reason: outcome.reason } : {}),
  });

  return {
    state: outcome.state,
    ...("reason" in outcome && outcome.reason ? { reason: outcome.reason } : {}),
    ...("refunded" in outcome ? { refunded: outcome.refunded } : {}),
  };
}

/**
 * Return a paid wallet order after a terminal failure.
 *
 * This is the manual counterpart to the automatic refund policy. It is only for
 * wallet-paid orders; gift orders never had a customer wallet charge.
 */
export async function refundOrderManually(orderId: string, note: string): Promise<void> {
  const admin = await requireAdmin();
  const order = await loadOrder(orderId);
  const reason = note.trim();

  if (reason.length === 0) {
    throw new OrderOpError("unknown", "A note is required.");
  }

  if (order.status === "completed") {
    throw new OrderOpError("already_delivered", "This order is already delivered.");
  }

  if (order.status === "refunded" || order.status === "cancelled") {
    throw new OrderOpError("refunded", "This order is already settled.");
  }

  if (order.payment_method !== "wallet" || order.payment_status !== "paid") {
    throw new OrderOpError(
      "not_refundable",
      "Only a paid wallet order can be refunded from this dashboard.",
    );
  }

  const service = createSupabaseServiceClient();
  const { error } = await service.rpc("refund_failed_order", {
    p_order_id: orderId,
    p_reason: reason,
    p_idempotency_key: orderId,
  });

  if (error) {
    throw new OrderOpError("unknown", error.message);
  }

  await audit(admin.id, "order.manual_refund", orderId, {
    order_number: order.order_number,
    note: reason,
  });

  await notify({
    userId: order.user_id,
    type: "order_failed",
    titleAr: "تمت إعادة مبلغ الطلب",
    titleEn: "Your order was refunded",
    bodyAr: `أعدنا مبلغ الطلب ${order.order_number} إلى محفظتك. ${reason}`,
    bodyEn: `The amount for order ${order.order_number} was returned to your wallet. ${reason}`,
    href: `/orders/${orderId}`,
    entityType: "order",
    entityId: orderId,
  });
}

/**
 * Mark an order delivered by hand.
 *
 * For when the owner topped the player up themselves, or sent a code over chat,
 * and the store's record needs to catch up. It changes the order's state and
 * notifies the customer; it does not touch the wallet, because the money was
 * already taken at checkout and this is not a second payment.
 *
 * When a `deliveredPayload` is provided — one or more newline-separated codes
 * or URLs the operator is handing over — it is written to the fulfilment row so
 * the order page can display them the same way an automated delivery would.
 *
 * A note is required: six months later, "why is this order completed with no
 * supplier attempt?" needs an answer in the record.
 */
export async function markDelivered(
  orderId: string,
  note: string,
  deliveredPayload?: string,
): Promise<void> {
  const admin = await requireAdmin();
  const order = await loadOrder(orderId);
  const reason = note.trim();

  if (reason.length === 0) {
    throw new OrderOpError("unknown", "A note is required.");
  }

  if (isSettledOrderStatus(order.status)) {
    throw new OrderOpError(
      order.status === "completed" ? "already_delivered" : "refunded",
      order.status === "completed"
        ? "This order is already delivered."
        : "This order was refunded or cancelled and cannot be marked delivered.",
    );
  }

  const service = createSupabaseServiceClient();
  const { error } = await service
    .from("orders")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    // Re-check the status in the statement itself, so two operators pressing at
    // once cannot both succeed.
    .not("status", "in", "(completed,refunded,cancelled)");

  if (error) {
    throw new OrderOpError("unknown", error.message);
  }

  const deliveryItems = deliveredPayload
    ?.split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (deliveryItems && deliveryItems.length > 0) {
    const { data: orderItem } = await service
      .from("order_items")
      .select("id")
      .eq("order_id", orderId)
      .limit(1)
      .maybeSingle();

    if (orderItem) {
      const { error: attemptError } = await service.from("fulfillment_attempts").insert({
        order_item_id: orderItem.id,
        provider: "manual",
        status: "completed",
        delivered_payload: { items: deliveryItems },
      });

      if (attemptError) {
        log.warn("admin-order-ops", "mark_delivered_attempt_write_failed", {
          orderId,
          error: attemptError.message,
        });
      }
    }
  }

  await audit(admin.id, "order.mark_delivered", orderId, {
    order_number: order.order_number,
    note: reason,
  });

  await notify({
    userId: order.user_id,
    type: "order_delivered",
    titleAr: "تم تنفيذ طلبك",
    titleEn: "Your order is delivered",
    bodyAr: `طلب ${order.order_number} جاهز. ${reason}`,
    bodyEn: `Order ${order.order_number} is ready. ${reason}`,
    href: `/orders/${orderId}`,
    entityType: "order",
    entityId: orderId,
  });
}

/**
 * Send the standard delivery notification to the customer again.
 *
 * Notifications are created by the code that settles an order, never by the
 * database — a status change in SQL produces no notification. That is exactly
 * the gap this fills: a delivery recorded outside the dashboard (a raw update,
 * a catch-up after the automatic path gave up) leaves the customer without the
 * "your order is ready" they are owed, and there is no state left for "mark
 * delivered" to act on.
 *
 * So this only tells them, at last. It changes no state, hands over nothing
 * further, and never touches the wallet — the order is already settled, and its
 * only job is to produce the `order_delivered` notification a normal settlement
 * would have produced in the first place.
 */
export async function resendDeliveryNotification(orderId: string): Promise<void> {
  const admin = await requireAdmin();
  const order = await loadOrder(orderId);

  if (order.status !== "completed") {
    throw new OrderOpError(
      "not_delivered",
      "Only a delivered order has a delivery notification to resend.",
    );
  }

  await notify({
    userId: order.user_id,
    type: "order_delivered",
    titleAr: "تم تنفيذ طلبك",
    titleEn: "Your order is delivered",
    bodyAr: `طلب ${order.order_number} جاهز. افتح الطلب لعرض التفاصيل.`,
    bodyEn: `Order ${order.order_number} is ready. Open it to see the details.`,
    href: `/orders/${orderId}`,
    entityType: "order",
    entityId: orderId,
  });

  await audit(admin.id, "order.notification_resend", orderId, {
    order_number: order.order_number,
    type: "order_delivered",
  });
}
