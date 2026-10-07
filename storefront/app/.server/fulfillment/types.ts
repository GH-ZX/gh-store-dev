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
  /**
   * The supplier refused for lack of funds in a wallet the store owns. The
   * customer paid, so this is neither a delivery nor a failure: the order is
   * parked at `held` with the supplier's answer recorded, waiting for the owner
   * to recharge and press "deliver now". It is never refunded and never bought
   * by the sweep.
   */
  | { state: "held"; reason: string }
  | { state: "failed"; reason: string; refunded: boolean }
  | { state: "skipped"; reason: string };

/** What a reconciliation pass did to one order. */
export type ReconcileOutcome = {
  action: "completed" | "refunded" | "escalated" | "wait" | "skipped";
  reason?: string;
};
