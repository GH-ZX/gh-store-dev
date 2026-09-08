/**
 * Where one top-up stands between "the customer paid" and "the wallet has it".
 *
 * Stage 10's exit criterion is that every payment state maps to one auditable
 * wallet result, and the only way to show that is to compare the two directly
 * rather than trust either alone. A top-up carries three independent facts: what
 * the request says, what the payment provider says, and whether a wallet
 * transaction actually exists. They agree almost always, and the cases where
 * they do not are the entire reason this screen exists.
 *
 * The reference store collapses the three into one pill through a precedence
 * ladder that checks "cancelled" before "paid", so its worst case — an invoice
 * paid moments after the request expired — displays as a plain grey Cancelled
 * row. That is the one an operator most needs to see, so here a disagreement is
 * its own state and never hides behind a status that happens to be checked
 * first.
 */

export type PaymentReconciliation =
  /** Approved and credited: the money and the wallet agree. */
  | "settled"
  /** The owner still has to decide. Not a fault. */
  | "awaiting_review"
  /** Nothing has arrived yet. Not a fault. */
  | "open"
  /** Closed with no money taken. Not a fault. */
  | "closed"
  /** Paid, and the wallet never received it. Money taken, nothing given. */
  | "not_credited"
  /** Credited without a payment behind it. Goods given, nothing taken. */
  | "unbacked"
  /** Less arrived than was billed. */
  | "short_paid";

export type PaymentFacts = {
  /** `recharge_requests.status`. */
  requestStatus: string;
  /** `sam_invoices.status`, or null for a manual transfer. */
  invoiceStatus: string | null;
  /** True once a wallet transaction exists for this request. */
  credited: boolean;
  /** What the invoice billed, and what actually arrived. */
  billedAmount: number | null;
  paidAmount: number | null;
};

/**
 * Invoice states that claim the money arrived and should already have credited.
 *
 * `awaiting_review` is deliberately not here. The money arrived and the owner
 * asked to see it first, so an uncredited wallet is the intended outcome rather
 * than a fault — it is the one uncredited payment nobody needs to chase.
 */
const PAID_INVOICE = new Set(["paid", "credited"]);

/** Request states that are finished without money changing hands. */
const CLOSED_REQUEST = new Set(["rejected", "expired", "cancelled"]);

export function reconcilePayment(facts: PaymentFacts): PaymentReconciliation {
  const paid = facts.invoiceStatus !== null && PAID_INVOICE.has(facts.invoiceStatus);

  /*
   * Checked before anything else. A credit with nothing behind it is the one
   * fault that costs the store rather than the customer, and no status on the
   * request or the invoice will ever describe it — it is visible only by
   * comparing the wallet against the payment.
   */
  if (facts.credited && !paid && facts.requestStatus !== "approved") {
    return "unbacked";
  }

  if (facts.credited) {
    // Short payments are refused before crediting, so one that credited anyway
    // is worth surfacing rather than assuming the guard held.
    return isShort(facts) ? "short_paid" : "settled";
  }

  // Held on purpose, before anything below can read it as a fault.
  if (facts.invoiceStatus === "awaiting_review") {
    return "awaiting_review";
  }

  if (paid) {
    /*
     * Paid and not credited. Deliberately reported even when the request reads
     * `cancelled` or `expired`: a payment landing just after the request closed
     * is exactly the case that must not be filed away as merely closed.
     */
    return isShort(facts) ? "short_paid" : "not_credited";
  }

  if (facts.requestStatus === "approved") {
    // Approved but no wallet transaction: the credit did not land.
    return "not_credited";
  }

  if (facts.requestStatus === "processing") {
    return "awaiting_review";
  }

  return CLOSED_REQUEST.has(facts.requestStatus) ? "closed" : "open";
}

function isShort(facts: PaymentFacts): boolean {
  return (
    facts.billedAmount !== null &&
    facts.paidAmount !== null &&
    facts.paidAmount < facts.billedAmount
  );
}

/** The states an operator has to do something about. */
const FAULTS: PaymentReconciliation[] = ["not_credited", "unbacked", "short_paid"];

export function needsAttention(state: PaymentReconciliation): boolean {
  return FAULTS.includes(state);
}
