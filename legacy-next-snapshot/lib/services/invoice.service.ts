import "server-only";

import type { Locale } from "@/i18n/config";
import { requireAuth } from "@/lib/auth/guards";
import { logFailure } from "@/lib/logging/logger";
import {
  buildInvoiceLines,
  buildRechargeDocument,
  type InvoiceDocument,
  type RechargeInvoiceDocument,
} from "@/lib/services/invoice-document";
import { getMyOrder, type MyOrderDetail } from "@/lib/services/orders-read.service";
import { getMyRechargeRequest } from "@/lib/services/recharge.service";
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

export type OrderInvoice = InvoiceDocument & {
  invoiceNumber: string;
  issuedAt: string;
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
    lines: buildInvoiceLines(
      order.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        fields: item.fields.map((field) => ({ label: field.label, value: field.value })),
        // The codes a fulfilment delivered are part of what the invoice records:
        // a receipt for a code product that does not carry the code is a receipt
        // that says nothing useful.
        codes: item.fulfillment?.codes ?? [],
      })),
    ),
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

export type RechargeInvoice = RechargeInvoiceDocument & {
  invoiceNumber: string;
  issuedAt: string;
};

/**
 * The invoice for one of the caller's own wallet recharges, issuing it if it
 * is new.
 *
 * A recharge is documented only once it was actually credited: a request that
 * is pending, in review, or rejected is a statement about money, not a payment.
 * The snapshot is written with service authority into the same `invoices` table
 * under `entity_type = 'recharge'`, and the request itself is read through the
 * caller's own session first — RLS decides whose invoice this can be.
 */
export async function getRechargeInvoice(requestId: string): Promise<RechargeInvoice | null> {
  const user = await requireAuth();
  const request = await getMyRechargeRequest(requestId);

  if (!request) {
    return null;
  }

  // Only money that reached the wallet is worth documenting.
  if (request.status !== "approved") {
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

  const documentInput = {
    reference: request.reference,
    requestedAt: request.createdAt,
    resolvedAt: request.resolvedAt,
    status: request.status,
    paymentMethod: request.paymentMethod,
    currency: request.currency,
    requestedAmount: request.requestedAmount,
    creditedAmount: request.creditedAmount,
    exchangeRate: request.exchangeRate,
    adminNote: request.adminNote,
    customer,
  };

  const { data: existing } = await service
    .from("invoices")
    .select("invoice_number, document_data, created_at")
    .eq("entity_type", "recharge")
    .eq("entity_id", requestId)
    .maybeSingle();

  if (existing) {
    const document = existing.document_data as Partial<RechargeInvoice> | null;

    return {
      ...buildRechargeDocument(documentInput),
      // The stored snapshot wins over anything live, which is the whole point.
      ...(document ?? {}),
      invoiceNumber: existing.invoice_number,
      issuedAt: existing.created_at,
    } as RechargeInvoice;
  }

  const document = buildRechargeDocument(documentInput);
  const { data: created, error } = await service
    .from("invoices")
    .insert({
      user_id: user.id,
      entity_type: "recharge",
      entity_id: requestId,
      // An approved recharge is money the store confirmed.
      status: "paid",
      currency: request.currency,
      document_data: document as never,
    })
    .select("invoice_number, created_at")
    .maybeSingle();

  if (error || !created) {
    logFailure("invoices", "recharge_issue_failed", error, { requestId });

    return null;
  }

  return { ...document, invoiceNumber: created.invoice_number, issuedAt: created.created_at };
}
