/**
 * Invoice document shape, kept pure so the mapping can be tested without a
 * database or a session.
 *
 * An invoice is a snapshot: it has to keep saying what was bought, what it cost,
 * the details the customer submitted, and the codes that were delivered — on the
 * day it was issued. Everything the store renders for it comes from this shape,
 * and every input to it is something an operator can edit or a fulfilment can
 * change afterwards. Nothing here reads a live row.
 */

export type InvoiceFieldEntry = {
  label: string;
  value: string;
};

export type InvoiceLine = {
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  /** Account details the customer submitted (player ID, server, character…). */
  fields: InvoiceFieldEntry[];
  /** Redeem codes the supplier delivered, empty for a direct UID top-up. */
  codes: string[];
};

export type InvoiceCustomer = {
  name: string | null;
  email: string | null;
};

export type InvoiceDocument = {
  orderNumber: string;
  orderDate: string;
  status: string;
  paymentMethod: string | null;
  currency: string;
  subtotal: number;
  discount: number;
  total: number;
  lines: InvoiceLine[];
  customer: InvoiceCustomer;
};

/**
 * A wallet recharge, folded into a document the same way an order is.
 *
 * Recharges have no lines — nothing is bought, money is added — so the shape
 * documents the transfer itself: what was requested, what was credited, and at
 * which rate, on the day the store confirmed it.
 */
export type RechargeInvoiceDocument = {
  rechargeReference: string;
  requestedAt: string;
  resolvedAt: string | null;
  status: string;
  paymentMethod: string;
  currency: string;
  requestedAmount: number;
  creditedAmount: number | null;
  exchangeRate: number | null;
  adminNote: string | null;
  customer: InvoiceCustomer;
};

export type RechargeDocumentInput = {
  reference: string;
  requestedAt: string;
  resolvedAt: string | null;
  status: string;
  paymentMethod: string;
  currency: string;
  requestedAmount: number;
  creditedAmount: number | null;
  exchangeRate: number | null;
  adminNote: string | null;
  customer: InvoiceCustomer;
};

/**
 * Fold a recharge request into a document snapshot.
 *
 * The status and payment method stay as their raw keys — the document records
 * what happened, and the page that renders it translates the keys for the
 * language the reader is using now. Amounts are kept as-is: what the request
 * asked for and what the store actually credited can differ, and both belong
 * on the receipt.
 */
export function buildRechargeDocument(input: RechargeDocumentInput): RechargeInvoiceDocument {
  return {
    rechargeReference: clean(input.reference),
    requestedAt: input.requestedAt,
    resolvedAt: input.resolvedAt,
    status: clean(input.status),
    paymentMethod: clean(input.paymentMethod),
    currency: clean(input.currency).toUpperCase() || "USD",
    requestedAmount: input.requestedAmount,
    creditedAmount: input.creditedAmount,
    exchangeRate: input.exchangeRate,
    adminNote: clean(input.adminNote ?? "") || null,
    customer: {
      name: input.customer.name,
      email: input.customer.email,
    },
  };
}

/** A line as it comes out of the order reader, before it is folded into the snapshot. */
export type InvoiceLineInput = {
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  fields: { label: string; value: string }[];
  codes: string[];
};

function clean(value: string): string {
  return value.trim();
}

/**
 * Fold order items into invoice lines.
 *
 * Empty account entries are dropped: a blank "server" field on a document would
 * read as an empty promise. Codes are de-duplicated and ordered, because a
 * supplier reply may repeat one and a receipt that repeats itself is a receipt
 * nobody trusts.
 */
export function buildInvoiceLines(items: InvoiceLineInput[]): InvoiceLine[] {
  return items.map((item) => ({
    name: item.name,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    totalPrice: item.totalPrice,
    fields: item.fields
      .map((field) => ({ label: clean(field.label), value: clean(field.value) }))
      .filter((field) => field.label.length > 0 && field.value.length > 0),
    codes: [...new Set(item.codes.map(clean).filter((code) => code.length > 0))],
  }));
}