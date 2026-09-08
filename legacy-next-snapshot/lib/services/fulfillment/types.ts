/**
 * The outcomes fulfilment and reconciliation can reach.
 *
 * Kept apart from the code that produces them so the money-critical states
 * stay readable in one glance — every branch in the worker narrows to one of
 * these, and every caller (checkout, an operator's retry, the sweep) speaks
 * the same vocabulary.
 */

export type FulfillmentOutcome =
  | { state: "completed"; deliveredItems: string[] }
  | { state: "processing" }
  | { state: "failed"; reason: string; refunded: boolean }
  | { state: "skipped"; reason: string };

/** What a reconciliation pass did to one order. */
export type ReconcileOutcome = {
  action: "completed" | "refunded" | "escalated" | "wait" | "skipped";
  reason?: string;
};
