import "server-only";

import { requireAdmin } from "@/lib/auth/guards";
import { worstFulfillmentState } from "@/lib/orders/fulfillment-state";
import { safeFilterTerm } from "@/lib/supabase/filters";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

/**
 * Order reads for the dashboard.
 *
 * Behind {@link requireAdmin} and using the admin's own session, so the database
 * policy is the real gate rather than a service-role key.
 *
 * Item names come from the purchase-time snapshot, never from the live catalog: a
 * later rename or price change must not rewrite what someone bought. The
 * provider's raw request and response are shown unedited, because when a delivery
 * fails the exact payload is the only thing that explains why — this is the one
 * place in the store where provider jargon belongs.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ADMIN_ORDER_STATUSES = [
  "pending",
  "payment_pending",
  "paid",
  "processing",
  "fulfilling",
  "completed",
  "failed",
  "refunded",
  "cancelled",
] as const;

export type AdminOrderStatus = (typeof ADMIN_ORDER_STATUSES)[number];

/**
 * Statuses an operator usually wants to see first: money taken, goods not out.
 *
 * Selectable as one filter under {@link ATTENTION_FILTER}, because "what is
 * broken right now" is a single question, not four.
 */
export const ATTENTION_STATUSES: AdminOrderStatus[] = ["failed", "fulfilling", "processing", "paid"];

export const ATTENTION_FILTER = "attention";

export type AdminOrderRow = {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  total: number;
  currency: string;
  createdAt: string;
  customer: { id: string; email: string | null; name: string | null };
  itemNames: string[];
  /** Worst fulfilment state across the order's items, or null before any attempt. */
  fulfillmentState: string | null;
};

export type AdminOrderAttempt = {
  id: string;
  provider: string;
  status: string;
  attemptNumber: number;
  externalOrderId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  request: Json;
  response: Json;
  delivered: Json | null;
  createdAt: string;
  completedAt: string | null;
};

export type AdminOrderItem = {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  /** What the customer typed at checkout: player id, server, character name. */
  dynamicFields: { key: string; value: string }[];
  attempts: AdminOrderAttempt[];
};

export type AdminOrderDetail = {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string | null;
  total: number;
  subtotal: number;
  discount: number;
  currency: string;
  customerNote: string | null;
  metadata: Json;
  createdAt: string;
  completedAt: string | null;
  customer: { id: string; email: string | null; name: string | null };
  items: AdminOrderItem[];
  /** Every wallet movement tied to this order, so the money is auditable here. */
  transactions: { id: string; type: string; amount: number; balanceAfter: number; description: string | null; createdAt: string }[];
};

type ProfileEmbed = { id: string; email: string | null; full_name: string | null; username: string | null };

function toCustomer(profiles: ProfileEmbed[] | ProfileEmbed | null, fallbackId: string) {
  const profile = Array.isArray(profiles) ? profiles[0] : profiles;

  return {
    id: fallbackId,
    email: profile?.email ?? null,
    name: profile?.full_name ?? profile?.username ?? null,
  };
}

function toFields(value: Json): { key: string; value: string }[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  return Object.entries(value as Record<string, unknown>).map(([key, raw]) => ({
    key,
    value: typeof raw === "string" ? raw : JSON.stringify(raw),
  }));
}

export type OrderListFilter = {
  status?: string;
  /** Matched against the order number and against the customer who placed it. */
  search?: string;
};

/**
 * Orders for the dashboard list.
 *
 * A search matches either the order number or the customer, because an operator
 * holding a complaint has whichever of the two the customer happened to give
 * them. Matching the customer takes one extra query first: PostgREST cannot
 * filter on an embedded profile's columns, so the ids are resolved and then used
 * as an `in` clause alongside the order-number match.
 *
 * The status filter applies to both halves of that search — filtering to
 * "failed" while searching an email must not quietly return every status.
 */
export async function getOrders(filter: OrderListFilter = {}): Promise<AdminOrderRow[]> {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const search = filter.search?.trim();
  const term = search ? safeFilterTerm(search) : "";

  let query = supabase
    .from("orders")
    .select(
      `id, order_number, status, payment_status, total, currency, created_at, user_id,
       profiles!orders_user_id_fkey (id, email, full_name, username),
       order_items (id, name_ar_snapshot, name_en_snapshot, fulfillment_attempts (status))`,
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (filter.status === ATTENTION_FILTER) {
    query = query.in("status", ATTENTION_STATUSES);
  } else if (filter.status && (ADMIN_ORDER_STATUSES as readonly string[]).includes(filter.status)) {
    query = query.eq("status", filter.status);
  }

  if (term) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id")
      .or([`email.ilike.%${term}%`, `full_name.ilike.%${term}%`, `username.ilike.%${term}%`].join(","))
      .limit(50);

    const ids = (profiles ?? []).map((profile) => profile.id);
    const clauses = [`order_number.ilike.%${term}%`];

    if (ids.length > 0) {
      clauses.push(`user_id.in.(${ids.join(",")})`);
    }

    query = query.or(clauses.join(","));
  }

  const { data } = await query;

  return (data ?? []).map((row) => {
    const items = (row.order_items ?? []) as {
      id: string;
      name_ar_snapshot: string;
      name_en_snapshot: string;
      fulfillment_attempts: { status: string }[] | null;
    }[];

    const states = items.flatMap((item) => (item.fulfillment_attempts ?? []).map((a) => a.status));

    return {
      id: row.id,
      orderNumber: row.order_number,
      status: row.status,
      paymentStatus: row.payment_status,
      total: row.total,
      currency: row.currency,
      createdAt: row.created_at,
      customer: toCustomer(row.profiles as ProfileEmbed | ProfileEmbed[] | null, row.user_id),
      itemNames: items.map((item) => item.name_en_snapshot || item.name_ar_snapshot),
      fulfillmentState: worstFulfillmentState(states),
    };
  });
}

export async function getOrderDetail(orderId: string): Promise<AdminOrderDetail | null> {
  await requireAdmin();

  // Reject a malformed id here: sending it to Postgres would raise a type error
  // rather than simply finding nothing.
  if (!UUID_PATTERN.test(orderId)) {
    return null;
  }

  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("orders")
    .select(
      `id, order_number, status, payment_status, payment_method, total, subtotal, discount,
       currency, customer_note, metadata, created_at, completed_at, user_id,
       profiles!orders_user_id_fkey (id, email, full_name, username),
       order_items (
         id, name_ar_snapshot, name_en_snapshot, quantity, unit_price, total_price, dynamic_fields,
         fulfillment_attempts (
           id, provider, status, attempt_number, external_order_id, error_code, error_message,
           request_payload, response_payload, delivered_payload, created_at, completed_at
         )
       )`,
    )
    .eq("id", orderId)
    .maybeSingle();

  if (!data) {
    return null;
  }

  const { data: transactions } = await supabase
    .from("wallet_transactions")
    .select("id, type, amount, balance_after, description, created_at")
    .eq("reference_id", orderId)
    .order("created_at", { ascending: true });

  const items = (data.order_items ?? []) as {
    id: string;
    name_ar_snapshot: string;
    name_en_snapshot: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    dynamic_fields: Json;
    fulfillment_attempts: {
      id: string;
      provider: string;
      status: string;
      attempt_number: number;
      external_order_id: string | null;
      error_code: string | null;
      error_message: string | null;
      request_payload: Json;
      response_payload: Json;
      delivered_payload: Json | null;
      created_at: string;
      completed_at: string | null;
    }[] | null;
  }[];

  return {
    id: data.id,
    orderNumber: data.order_number,
    status: data.status,
    paymentStatus: data.payment_status,
    paymentMethod: data.payment_method,
    total: data.total,
    subtotal: data.subtotal,
    discount: data.discount,
    currency: data.currency,
    customerNote: data.customer_note,
    metadata: data.metadata,
    createdAt: data.created_at,
    completedAt: data.completed_at,
    customer: toCustomer(data.profiles as ProfileEmbed | ProfileEmbed[] | null, data.user_id),
    items: items.map((item) => ({
      id: item.id,
      name: item.name_en_snapshot || item.name_ar_snapshot,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      totalPrice: item.total_price,
      dynamicFields: toFields(item.dynamic_fields),
      attempts: (item.fulfillment_attempts ?? [])
        .map((attempt) => ({
          id: attempt.id,
          provider: attempt.provider,
          status: attempt.status,
          attemptNumber: attempt.attempt_number,
          externalOrderId: attempt.external_order_id,
          errorCode: attempt.error_code,
          errorMessage: attempt.error_message,
          request: attempt.request_payload,
          response: attempt.response_payload,
          delivered: attempt.delivered_payload,
          createdAt: attempt.created_at,
          completedAt: attempt.completed_at,
        }))
        .sort((a, b) => a.attemptNumber - b.attemptNumber),
    })),
    transactions: (transactions ?? []).map((transaction) => ({
      id: transaction.id,
      type: transaction.type,
      amount: transaction.amount,
      balanceAfter: transaction.balance_after,
      description: transaction.description,
      createdAt: transaction.created_at,
    })),
  };
}
