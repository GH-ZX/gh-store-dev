import "server-only";

import type { Locale } from "@/i18n/config";
import { requireAuth } from "@/lib/auth/guards";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Order reads for the signed-in customer.
 *
 * Read-only by construction: `authenticated` holds SELECT and nothing else on
 * `orders` and `order_items`, so an order only ever comes into existence through
 * the checkout RPC. RLS already scopes both tables to the owner, and every query
 * here also filters by `user_id` — a policy change should not silently widen what
 * a page shows.
 *
 * Item names are stored as snapshots taken at purchase time. A later rename or
 * price change in the catalog must not rewrite history, so the order pages read
 * the snapshot rather than joining the live offer.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ORDER_STATUSES = [
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

const PAYMENT_STATUSES = ["pending", "paid", "failed", "refunded", "cancelled"] as const;

const FULFILLMENT_STATES = [
  "pending",
  "processing",
  "completed",
  "failed",
  "refunded",
  "reconcile",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type OrderPaymentStatus = (typeof PAYMENT_STATUSES)[number];
export type FulfillmentState = (typeof FULFILLMENT_STATES)[number];

/**
 * The status columns are free `text` with a check constraint, so they arrive as
 * `string`. Narrowing here keeps every caller's message lookup exhaustive, and an
 * unrecognised value degrades to the most cautious reading rather than throwing.
 */
function toOrderStatus(value: string): OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(value) ? (value as OrderStatus) : "pending";
}

function toPaymentStatus(value: string): OrderPaymentStatus {
  return (PAYMENT_STATUSES as readonly string[]).includes(value)
    ? (value as OrderPaymentStatus)
    : "pending";
}

function toFulfillmentState(value: string): FulfillmentState {
  return (FULFILLMENT_STATES as readonly string[]).includes(value)
    ? (value as FulfillmentState)
    : "pending";
}

export type MyOrderSummary = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: OrderPaymentStatus;
  total: number;
  currency: string;
  createdAt: string;
  /** Name snapshot of the first item, for a one-line description of the order. */
  itemName: string | null;
  itemCount: number;
};

export type OrderFieldEntry = {
  key: string;
  /** The label the customer saw at checkout, or the raw key when it is gone. */
  label: string;
  value: string;
};

export type OrderFulfillment = {
  state: FulfillmentState;
  /** Redeem codes the supplier delivered, when this is a code product. */
  codes: string[];
  errorMessage: string | null;
};

export type MyOrderItem = {
  id: string;
  name: string;
  unitPrice: number;
  quantity: number;
  totalPrice: number;
  fields: OrderFieldEntry[];
  fulfillment: OrderFulfillment | null;
};

export type MyOrderDetail = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: OrderPaymentStatus;
  paymentMethod: string | null;
  currency: string;
  subtotal: number;
  discount: number;
  total: number;
  customerNote: string | null;
  createdAt: string;
  completedAt: string | null;
  items: MyOrderItem[];
  /** Worst state across the items, so one stuck item is never hidden. */
  fulfillmentState: FulfillmentState | null;
  codes: string[];
  failureMessage: string | null;
};

type RawItem = {
  id: string;
  offer_id: string | null;
  name_ar_snapshot: string;
  name_en_snapshot: string;
  unit_price: number;
  quantity: number;
  total_price: number;
  dynamic_fields: unknown;
};

function snapshotName(item: { name_ar_snapshot: string; name_en_snapshot: string }, locale: Locale): string {
  return locale === "ar" ? item.name_ar_snapshot : item.name_en_snapshot;
}

/** A to-many embed is an array, but tolerate the single-object shape. */
function toRows<T>(value: T | T[] | null | undefined): T[] {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function toFieldEntries(value: unknown): { key: string; value: string }[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  return Object.entries(value as Record<string, unknown>).flatMap(([key, raw]) => {
    if (typeof raw === "string") {
      return raw.trim() ? [{ key, value: raw }] : [];
    }

    return typeof raw === "number" ? [{ key, value: String(raw) }] : [];
  });
}

/**
 * Codes out of a delivered payload.
 *
 * The current worker stores `{ items: string[] }`; `{ codes: string[] }` is also
 * accepted for records written by the first stored-product implementation.
 * Anything else is treated as "no codes" rather than rendered raw: a JSON blob
 * on an order page tells a customer nothing and may carry provider internals.
 */
export function toDeliveredCodes(payload: unknown): string[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return [];
  }

  const record = payload as { items?: unknown; codes?: unknown };
  const items = record.items ?? record.codes;

  if (!Array.isArray(items)) {
    return [];
  }
  return items.flatMap((item) => {
    if (typeof item === "string" && item.trim()) {
      return [item.trim()];
    }

    if (item && typeof item === "object" && !Array.isArray(item)) {
      const record = item as Record<string, unknown>;
      const candidate =
        record.url ??
        record.link ??
        record.code ??
        record.token ??
        record.email ??
        record.value ??
        record.text;

      if (typeof candidate === "string" && candidate.trim()) {
        return [candidate.trim()];
      }

      const text = JSON.stringify(record);

      return text.length > 2 ? [text] : [];
    }

    return [];
  });
}

const ORDER_LIST_LIMIT = 50;

export async function getMyOrders(locale: Locale): Promise<MyOrderSummary[]> {
  const user = await requireAuth();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, status, payment_status, total, currency, created_at, order_items (id, name_ar_snapshot, name_en_snapshot, created_at)",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(ORDER_LIST_LIMIT);

  if (error || !data) {
    return [];
  }

  return data.map((row) => {
    const items = toRows(row.order_items);
    const first = items[0] ?? null;

    return {
      id: row.id,
      orderNumber: row.order_number,
      status: toOrderStatus(row.status),
      paymentStatus: toPaymentStatus(row.payment_status),
      total: row.total,
      currency: row.currency,
      createdAt: row.created_at,
      itemName: first ? snapshotName(first, locale) : null,
      itemCount: items.length,
    };
  });
}

/**
 * The labels a customer saw for the account fields, by field key.
 *
 * `dynamic_fields` stores keys, not labels, so showing "userid" on the order page
 * would be a worse account of what was submitted than showing "Player ID". The
 * labels live on the game, reached through the offer the item was bought from; a
 * deleted offer simply yields no labels and the keys are shown instead.
 */
async function readFieldLabels(offerIds: string[], locale: Locale): Promise<Map<string, string>> {
  const labels = new Map<string, string>();

  if (offerIds.length === 0) {
    return labels;
  }

  const supabase = await createSupabaseServerClient();
  const { data: offers } = await supabase.from("offers").select("id, game_id").in("id", offerIds);
  const gameIds = [
    ...new Set(
      (offers ?? [])
        .map((offer) => offer.game_id)
        .filter((gameId): gameId is string => gameId !== null),
    ),
  ];

  if (gameIds.length === 0) {
    return labels;
  }

  const { data: fields } = await supabase
    .from("game_input_fields")
    .select("field_key, label_ar, label_en")
    .in("game_id", gameIds);

  for (const field of fields ?? []) {
    labels.set(field.field_key, locale === "ar" ? field.label_ar : field.label_en);
  }

  return labels;
}

/** Fulfilment rows for a set of items, newest attempt per item. */
async function readFulfillment(itemIds: string[]): Promise<Map<string, OrderFulfillment>> {
  const byItem = new Map<string, OrderFulfillment>();

  if (itemIds.length === 0) {
    return byItem;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("fulfillment_attempts")
    .select("order_item_id, status, delivered_payload, error_message, created_at")
    .in("order_item_id", itemIds)
    .order("created_at", { ascending: false });

  if (error || !data) {
    return byItem;
  }

  for (const attempt of data) {
    // Ordered newest first, so the first row seen for an item is its latest.
    if (byItem.has(attempt.order_item_id)) {
      continue;
    }

    byItem.set(attempt.order_item_id, {
      state: toFulfillmentState(attempt.status),
      codes: toDeliveredCodes(attempt.delivered_payload),
      errorMessage: attempt.error_message,
    });
  }

  return byItem;
}

/** Least settled state wins, so a single stuck or failed item is never hidden. */
const STATE_SEVERITY: Record<FulfillmentState, number> = {
  failed: 5,
  reconcile: 4,
  refunded: 3,
  pending: 2,
  processing: 1,
  completed: 0,
};

function worstState(states: FulfillmentState[]): FulfillmentState | null {
  return states.reduce<FulfillmentState | null>(
    (worst, state) =>
      worst === null || STATE_SEVERITY[state] > STATE_SEVERITY[worst] ? state : worst,
    null,
  );
}

export async function getMyOrder(locale: Locale, orderId: string): Promise<MyOrderDetail | null> {
  const user = await requireAuth();

  // Reject a malformed id here: Postgres would raise a type error rather than
  // simply finding nothing.
  if (!UUID_PATTERN.test(orderId)) {
    return null;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, status, payment_status, payment_method, currency, subtotal, discount, total, customer_note, created_at, completed_at, order_items (id, offer_id, name_ar_snapshot, name_en_snapshot, unit_price, quantity, total_price, dynamic_fields)",
    )
    .eq("id", orderId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const rawItems: RawItem[] = toRows(data.order_items);
  const [labels, fulfillment] = await Promise.all([
    readFieldLabels(
      rawItems.flatMap((item) => (item.offer_id ? [item.offer_id] : [])),
      locale,
    ),
    readFulfillment(rawItems.map((item) => item.id)),
  ]);

  const items: MyOrderItem[] = rawItems.map((item) => ({
    id: item.id,
    name: snapshotName(item, locale),
    unitPrice: item.unit_price,
    quantity: item.quantity,
    totalPrice: item.total_price,
    fields: toFieldEntries(item.dynamic_fields).map((entry) => ({
      key: entry.key,
      label: labels.get(entry.key) ?? entry.key,
      value: entry.value,
    })),
    fulfillment: fulfillment.get(item.id) ?? null,
  }));

  const attempts = items.flatMap((item) => (item.fulfillment ? [item.fulfillment] : []));

  return {
    id: data.id,
    orderNumber: data.order_number,
    status: toOrderStatus(data.status),
    paymentStatus: toPaymentStatus(data.payment_status),
    paymentMethod: data.payment_method,
    currency: data.currency,
    subtotal: data.subtotal,
    discount: data.discount,
    total: data.total,
    customerNote: data.customer_note,
    createdAt: data.created_at,
    completedAt: data.completed_at,
    items,
    fulfillmentState: worstState(attempts.map((attempt) => attempt.state)),
    codes: attempts.flatMap((attempt) => attempt.codes),
    failureMessage: attempts.find((attempt) => attempt.errorMessage)?.errorMessage ?? null,
  };
}
