import "server-only";

import { requireAdmin } from "@/lib/auth/guards";
import { isSettledOrderStatus } from "@/lib/orders/order-status";
import { fulfillOrder } from "@/lib/services/fulfillment.service";
import { notify } from "@/lib/services/notification.service";
import { createSupabaseServiceClient, hasServiceRoleKey } from "@/lib/supabase/service";

/**
 * The two things an operator can do to an order that is stuck.
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
  readonly reason: "not_found" | "already_delivered" | "refunded" | "not_configured" | "unknown";

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
  user_id: string;
};

async function loadOrder(orderId: string): Promise<OrderRow> {
  if (!hasServiceRoleKey()) {
    throw new OrderOpError("not_configured", "SUPABASE_SERVICE_ROLE_KEY is not configured.");
  }

  const service = createSupabaseServiceClient();
  const { data } = await service
    .from("orders")
    .select("id, order_number, status, user_id")
    .eq("id", orderId)
    .maybeSingle();

  if (!data) {
    throw new OrderOpError("not_found", "Order not found.");
  }

  return data;
}

/** Record who did what, so a hand-made change is never anonymous. */
async function audit(
  actorId: string,
  action: string,
  orderId: string,
  values: Record<string, unknown>,
): Promise<void> {
  const service = createSupabaseServiceClient();
  await service.from("audit_logs").insert({
    actor_user_id: actorId,
    action,
    entity_type: "order",
    entity_id: orderId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- jsonb column
    new_values: values as any,
  });
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
 * Mark an order delivered by hand.
 *
 * For when the owner topped the player up themselves, or sent a code over chat,
 * and the store's record needs to catch up. It changes the order's state and
 * notifies the customer; it does not touch the wallet, because the money was
 * already taken at checkout and this is not a second payment.
 *
 * A note is required: six months later, "why is this order completed with no
 * supplier attempt?" needs an answer in the record.
 */
export async function markDelivered(orderId: string, note: string): Promise<void> {
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
