import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@server/types/database";
import type { Json } from "@server/types/database";
type Client = SupabaseClient<Database>;

import { requireAdminId } from "@server/lib/auth/guards";
import { log } from "@server/lib/logging/logger";
import {
  hasInsufficientBalanceAttempt,
  isHeldOrderStatus,
  isHeldOrderLike,
  isSettledOrderStatus,
  type HeldAttemptFacts,
} from "@server/lib/orders/order-status";
import { recordAudit } from "@server/lib/services/admin-audit.service";
import { clearOrderHold } from "@server/fulfillment/attempts";
import { fulfillOrder } from "@server/fulfillment/index";
import { createSupabaseServiceClient, hasServiceRoleKey } from "@server/lib/supabase/service";
import { OrderOpError } from "@server/lib/services/admin-order-ops.service";

/**
 * The held queue: orders the customer paid for that the store cannot buy yet
 * because a supplier wallet the owner controls is empty.
 *
 * This is the half of the hold feature the owner actually works with. The write
 * side parks the order and tells both audiences; this side answers the two
 * questions the owner has — "what is waiting, and how much do I need?" and
 * "I recharged, deliver it now" — without opening each order to find out.
 *
 * Three rules hold everywhere in this file:
 *
 *   * A debt already settled is never re-delivered. `completed`, `refunded` and
 *     `cancelled` are refused before the supplier is contacted, exactly as
 *     {@link retryFulfillment} refuses them; `fulfillOrder` then refuses them
 *     again independently, because the cost of getting this wrong is giving away
 *     stock.
 *   * Money never moves here. The customer was debited at checkout; delivering
 *     a held order spends the owner's supplier balance and nothing else.
 *   * An order only leaves `held` when the delivery actually succeeded. A retry
 *     that is refused again stays held with a refreshed reason, so the queue
 *     never shows a stale answer and never loses an order.
 */

/** How an order can be waiting on supplier funds, for the queue's own badge. */
export type HeldOrderReason = "held" | "insufficient_balance";

export type HeldOrderRow = {
  id: string;
  orderNumber: string;
  status: string;
  /** Why it is in this queue right now. */
  holdReason: HeldOrderReason;
  /**
   * What the store recorded when the hold began, or the order's own timestamp
   * for the three orders that predate this state and sit at `processing`.
   */
  heldAt: string;
  heldReasonText: string | null;
  /** Whole minutes since {@link heldAt}, for "waiting 4h 20m". */
  holdAgeMinutes: number;
  customer: { id: string; email: string | null; name: string | null };
  /** Product name from the purchase-time snapshot, never the live catalog. */
  productName: string;
  /** The package bought — the supplier's own catalogue name when mapped. */
  offerName: string | null;
  quantity: number;
  supplier: string | null;
  /** Unit supplier cost from the mapping, or null when unmapped. */
  supplierCostUsd: number | null;
  /** Unit cost × quantity: what the owner must have available to fulfil it. */
  requiredSupplierCostUsd: number | null;
  currency: string;
  /** The supplier's own words, unedited. */
  supplierError: string | null;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ProfileEmbed = { id: string; email: string | null; full_name: string | null; username: string | null };

type AttemptEmbed = {
  status: string;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
};

type MappingEmbed = {
  provider_name: string | null;
  external_catalogue_name: string | null;
  supplier_cost_usd: number | null;
};

type ItemEmbed = {
  id: string;
  name_ar_snapshot: string;
  name_en_snapshot: string;
  quantity: number;
  metadata: Json;
  offers: MappingEmbed | MappingEmbed[] | null;
  fulfillment_attempts: AttemptEmbed[] | null;
};

type OrderEmbed = {
  id: string;
  order_number: string;
  status: string;
  payment_status: string;
  currency: string;
  created_at: string;
  user_id: string;
  held_reason: string | null;
  held_at: string | null;
  profiles: ProfileEmbed | ProfileEmbed[] | null;
  order_items: ItemEmbed[] | null;
};

const HELD_QUEUE_STATUSES = ["held", "processing", "fulfilling"];

/**
 * The columns the held queue needs.
 *
 * One nested read rather than a query per order: the queue is small, and the
 * supplier cost, the supplier's error and the package name all live behind
 * different foreign keys, so fetching them one order at a time would be a dozen
 * round trips for a screen the owner opens every time a wallet runs dry.
 */
const HELD_QUEUE_SELECT = `id, order_number, status, payment_status, currency, created_at, user_id,
  held_reason, held_at,
  profiles!orders_user_id_fkey (id, email, full_name, username),
  order_items (
    id, name_ar_snapshot, name_en_snapshot, quantity, metadata,
    offers (provider_offer_mappings (provider_name, external_catalogue_name, supplier_cost_usd)),
    fulfillment_attempts (status, error_code, error_message, created_at)
  )`;

function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) {
    return null;
  }

  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function heldSince(row: OrderEmbed): string {
  return row.held_at ?? row.created_at;
}

function minutesSince(iso: string, now: number): number {
  const started = Date.parse(iso);

  return Number.isFinite(started) ? Math.max(0, Math.floor((now - started) / 60_000)) : 0;
}

/**
 * The buyer-facing package name.
 *
 * The offer itself was renamed to `products`/`offers` over two migrations and
 * the item snapshot only stores the product name, so the package is taken from
 * the supplier's own catalogue name where one exists and falls back to the
 * snapshot. Nothing here reads the live price: a rename since purchase must not
 * rewrite what was bought.
 */
function packageName(item: ItemEmbed): string | null {
  const mapping = first(item.offers);
  const catalogue = mapping?.external_catalogue_name?.trim();

  return catalogue && catalogue.length > 0 ? catalogue : null;
}

function toRow(row: OrderEmbed, index: number, now: number): HeldOrderRow | null {
  const items = row.order_items ?? [];
  const item = items[index] ?? items[0];

  if (!item) {
    return null;
  }

  const mapping = first(item.offers);
  const attempts = (item.fulfillment_attempts ?? []).slice().sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );
  const latestWithError = [...attempts].reverse().find((attempt) => attempt.error_message);
  const held = isHeldOrderStatus(row.status);

  /*
   * A `held` row is in the queue on the status alone: the owner may have pressed
   * "deliver now" and failed for a different reason, and dropping it because the
   * last attempt no longer mentions balance would lose the order entirely.
   */
  if (!held && !hasInsufficientBalanceAttempt(attempts as HeldAttemptFacts[])) {
    return null;
  }

  const unitCost = typeof mapping?.supplier_cost_usd === "number" ? mapping.supplier_cost_usd : null;
  const customer = first(row.profiles);

  return {
    id: row.id,
    orderNumber: row.order_number,
    status: row.status,
    holdReason: held ? "held" : "insufficient_balance",
    heldAt: heldSince(row),
    heldReasonText: row.held_reason,
    holdAgeMinutes: minutesSince(heldSince(row), now),
    customer: {
      id: row.user_id,
      email: customer?.email ?? null,
      name: customer?.full_name ?? customer?.username ?? null,
    },
    productName:
      item.name_en_snapshot || item.name_ar_snapshot || packageName(item) || row.order_number,
    offerName: packageName(item),
    quantity: item.quantity,
    supplier: mapping?.provider_name ?? null,
    supplierCostUsd: unitCost,
    requiredSupplierCostUsd: unitCost === null ? null : unitCost * item.quantity,
    currency: row.currency,
    supplierError: latestWithError?.error_message ?? row.held_reason,
  };
}

/**
 * Held orders for the dashboard, oldest hold first.
 *
 * `processing`/`fulfilling` orders that carry an `insufficient_balance` attempt
 * are included even though their status was never migrated: they are the three
 * orders that were stranded before `held` existed, and the owner must be able to
 * see and deliver them exactly like a newly held one. Their status is left
 * untouched — the read side is tolerant, the history stays honest.
 */
export async function listHeldOrders(supabase: Client, now = Date.now()): Promise<HeldOrderRow[]> {
  await requireAdminId(supabase);

  const { data, error } = await supabase
    .from("orders")
    .select(HELD_QUEUE_SELECT)
    .in("status", HELD_QUEUE_STATUSES)
    .order("created_at", { ascending: true })
    .limit(100);

  if (error || !data) {
    log.warn("admin-hold", "held_queue_lookup_failed", { error: error?.message ?? "no data" });

    return [];
  }

  const rows = (data as unknown as OrderEmbed[]).flatMap((row) => {
    const items = row.order_items ?? [];

    // One queue entry per order, showing the item that is actually holding it.
    const holdingIndex = Math.max(
      0,
      items.findIndex((item) => hasInsufficientBalanceAttempt((item.fulfillment_attempts ?? []) as HeldAttemptFacts[])),
    );
    const mapped = toRow(row, holdingIndex, now);

    return mapped ? [mapped] : [];
  });

  return rows.sort((a, b) => a.heldAt.localeCompare(b.heldAt));
}

/**
 * How many orders are waiting on supplier funds, for the overview strip.
 *
 * Counted from the same read as the queue, so the badge and the list can never
 * disagree about how much work is waiting.
 */
export async function getHeldOrderCount(supabase: Client): Promise<number> {
  const rows = await listHeldOrders(supabase);

  return rows.length;
}

export type DeliverHeldResult = {
  state: string;
  reason?: string;
  refunded?: boolean;
  /** True when the retry delivered and the hold was lifted. */
  delivered: boolean;
};

/**
 * "I recharged — deliver now."
 *
 * Runs the real fulfilment path and only then lifts the hold. Every other
 * outcome leaves the order as it was, because an operator pressing a button is
 * not evidence that the supplier will answer differently, and a failed attempt
 * recorded as delivered would be a lie the money would have to pay for.
 *
 *   * delivered   → `held_reason`/`held_at` cleared, audited as delivered.
 *   * held again  → stays held with the refreshed reason; audited as still held.
 *   * other terminal failure (a wrong player id, a package the supplier
 *     withdrew) → the normal refund policy applies, unchanged: `fulfillOrder`
 *     has already settled it, and this wrapper reports what it decided.
 *
 * Idempotency is not re-implemented here. The provider purchase carries the
 * order item's key, so an order already bought cannot be bought twice even if a
 * second operator presses at the same moment.
 */
export async function deliverHeldOrder(
  supabase: Client,
  orderId: string,
): Promise<DeliverHeldResult> {
  const admin = await requireAdminId(supabase);

  if (!hasServiceRoleKey()) {
    throw new OrderOpError("not_configured", "SUPABASE_SERVICE_ROLE_KEY is not configured.");
  }

  if (!UUID_PATTERN.test(orderId)) {
    throw new OrderOpError("not_found", "Order not found.");
  }

  const service = createSupabaseServiceClient();
  const { data: order } = await service
    .from("orders")
    .select("id, order_number, status, user_id")
    .eq("id", orderId)
    .maybeSingle();

  if (!order) {
    throw new OrderOpError("not_found", "Order not found.");
  }

  // The same refusals `retryFulfillment` makes, stated here too: this entry
  // point must never be the one that hands goods over twice.
  if (order.status === "completed") {
    throw new OrderOpError("already_delivered", "This order is already delivered.");
  }

  if (isSettledOrderStatus(order.status)) {
    throw new OrderOpError(
      "refunded",
      "This order was refunded, so delivering it now would give the goods away.",
    );
  }

  if (!isHeldOrderLike(order.status, [])) {
    throw new OrderOpError(
      "not_held",
      "This order is not waiting on supplier funds, so there is nothing to release.",
    );
  }

  const outcome = await fulfillOrder(orderId);

  const releaseHold = outcome.state === "completed";
  if (releaseHold) {
    await clearOrderHold(orderId);
  }

  await recordAudit({
    actorId: admin.id,
    action: releaseHold ? "order.held_delivered" : "order.held_delivery_attempted",
    entityType: "order",
    entityId: orderId,
    values: {
      order_number: order.order_number,
      outcome: outcome.state,
      ...("reason" in outcome && outcome.reason ? { reason: outcome.reason } : {}),
      hold_released: releaseHold,
    },
  });

  return {
    state: outcome.state,
    ...("reason" in outcome && outcome.reason ? { reason: outcome.reason } : {}),
    ...("refunded" in outcome ? { refunded: outcome.refunded } : {}),
    delivered: releaseHold,
  };
}
