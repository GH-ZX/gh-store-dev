import "server-only";

import type { Locale } from "@/i18n/config";
import { requireAuth } from "@/lib/auth/guards";
import { logFailure } from "@/lib/logging/logger";
import { getMyOrder, type MyOrderDetail } from "@/lib/services/orders-read.service";
import { createSupabaseServiceClient, hasServiceRoleKey } from "@/lib/supabase/service";

/**
 * Order invoices.
 *
 * `invoices` has existed since the orders migration with `unique (entity_type,
 * entity_id)` and a `document_data` column, and nothing had ever written an
 * order invoice into it. This is that.
 *
 * The document is a **snapshot**, not a view. An invoice has to keep saying what
 * was bought and what it cost on the day it was issued, and every input to that
 * — a game's name, an offer's price — is something an operator can edit
 * afterwards. Rendering an invoice from live rows would quietly rewrite history
 * every time the catalog changed.
 *
 * Issued on first read rather than at checkout, for two reasons: most orders are
 * never invoiced by anybody, and an invoice written during checkout would be one
 * more thing able to fail while a customer is waiting to be told their purchase
 * worked.
 *
 * The row is written with service authority because `invoices` has no insert
 * policy for a customer — a document the store issues is not something a session
 * should be able to author. The *order* it describes is read through the
 * customer's own session first, so RLS decides whose invoice this can be.
 */

export type InvoiceLine = {
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
};

export type OrderInvoice = {
  invoiceNumber: string;
  issuedAt: string;
  orderNumber: string;
  orderDate: string;
  status: string;
  paymentMethod: string | null;
  currency: string;
  subtotal: number;
  discount: number;
  total: number;
  lines: InvoiceLine[];
  customer: { name: string | null; email: string | null };
};

function toDocument(order: MyOrderDetail, customer: OrderInvoice["customer"]): Omit<OrderInvoice, "invoiceNumber" | "issuedAt"> {
  return {
    orderNumber: order.orderNumber,
    orderDate: order.createdAt,
    status: order.status,
    paymentMethod: order.paymentMethod,
    currency: order.currency,
    subtotal: order.subtotal,
    discount: order.discount,
    total: order.total,
    lines: order.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
    })),
    customer,
  };
}

/**
 * The invoice for one of the caller's own orders, issuing it if it is new.
 *
 * Returns null when the order is not the caller's, does not exist, or has not
 * been paid — an invoice for something nobody has paid for is a document that
 * says nothing true.
 */
export async function getOrderInvoice(
  locale: Locale,
  orderId: string,
): Promise<OrderInvoice | null> {
  const user = await requireAuth();
  const order = await getMyOrder(locale, orderId);

  if (!order) {
    return null;
  }

  // `pending` and `payment_pending` have not been paid for. Everything past that
  // — including a refund — has a payment worth documenting.
  if (order.paymentStatus !== "paid" && order.paymentStatus !== "refunded") {
    return null;
  }

  const service = hasServiceRoleKey() ? createSupabaseServiceClient() : null;

  if (!service) {
    return null;
  }

  const { data: profile } = await service
    .from("profiles")
    .select("full_name, username, email")
    .eq("id", user.id)
    .maybeSingle();

  const customer = {
    name: profile?.full_name ?? profile?.username ?? null,
    email: profile?.email ?? null,
  };

  const { data: existing } = await service
    .from("invoices")
    .select("invoice_number, document_data, created_at")
    .eq("entity_type", "order")
    .eq("entity_id", orderId)
    .maybeSingle();

  if (existing) {
    const document = existing.document_data as Partial<OrderInvoice> | null;

    return {
      ...toDocument(order, customer),
      // The stored snapshot wins over anything live, which is the whole point.
      ...(document ?? {}),
      invoiceNumber: existing.invoice_number,
      issuedAt: existing.created_at,
    } as OrderInvoice;
  }

  const document = toDocument(order, customer);
  const { data: created, error } = await service
    .from("invoices")
    .insert({
      user_id: user.id,
      entity_type: "order",
      entity_id: orderId,
      // Mirrors the order: a refunded order carries a refunded invoice rather
      // than one that still claims to have been paid.
      status: order.paymentStatus === "refunded" ? "refunded" : "paid",
      currency: order.currency,
      document_data: document as never,
    })
    .select("invoice_number, created_at")
    .maybeSingle();

  if (error || !created) {
    logFailure("invoices", "issue_failed", error, { orderId });

    return null;
  }

  return { ...document, invoiceNumber: created.invoice_number, issuedAt: created.created_at };
}
