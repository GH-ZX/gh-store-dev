/**
 * What to do about an order the supplier never finished in front of the customer.
 *
 * Checkout polls the supplier for about ten seconds and then gives up, leaving
 * the order at `fulfilling`. That is a correct answer — a top-up can land
 * minutes later, and refunding early would give the goods away — but until now
 * nothing ever went back to ask how it turned out. This decides that, and it is
 * kept pure so the rules can be tested without a supplier or a database.
 *
 * The decisions are deliberately asymmetric. Completing an order hands over
 * goods, and failing one moves money, so both require the supplier to have said
 * so. Everything the supplier has not settled resolves to waiting, and only the
 * passage of time turns waiting into a question for a human.
 */

/** How the supplier answered, or null when it could not be asked or had no record. */
export type ProviderState = "completed" | "failed" | "pending" | null;

export type ReconcileDecision =
  | { action: "complete" }
  | { action: "fail"; reason: string }
  | { action: "wait" }
  | { action: "escalate"; reason: string };

export type ReconcileInput = {
  providerState: ProviderState;
  /** The supplier says it refunded its own side; ours still owes the customer. */
  refunded: boolean;
  /** False when no supplier order was ever recorded against this attempt. */
  hasExternalOrderId: boolean;
  /** Minutes since the attempt was opened. */
  ageMinutes: number;
};

/**
 * Long enough that an in-flight checkout is never second-guessed.
 *
 * Checkout can hold the supplier call for the better part of a minute in the
 * worst case, and a sweep that ran during it would be reasoning about an order
 * still being placed.
 */
export const GRACE_MINUTES = 10;

/**
 * When a supplier order that is still "pending" stops being merely slow.
 *
 * The classifier reports anything it does not recognise as pending, so a
 * contract change on the supplier's side would otherwise leave an order waiting
 * for a terminal state that never arrives. Age is the only backstop against
 * that, and against a genuinely stuck supplier order.
 */
export const STALE_MINUTES = 12 * 60;

/**
 * How long to keep looking for an order the supplier has no record of.
 *
 * The list endpoint is paginated and busy stores push an order off it, so "not
 * found" is not proof of anything early on.
 */
export const MISSING_MINUTES = 60;

export function decideReconciliation(input: ReconcileInput): ReconcileDecision {
  if (input.ageMinutes < GRACE_MINUTES) {
    return { action: "wait" };
  }

  /*
   * No supplier order id, and past the grace period: the purchase either never
   * happened or its reply was lost before it could be written down. Those two
   * are indistinguishable from here, and they want opposite things — one owes a
   * refund, the other has already delivered — so this is the one case that must
   * not be settled automatically in either direction.
   */
  if (!input.hasExternalOrderId) {
    return {
      action: "escalate",
      reason: "No supplier order was recorded, so we cannot tell whether this was bought.",
    };
  }

  // The supplier returning its own money is terminal whatever the status says.
  if (input.refunded) {
    return { action: "fail", reason: "The supplier refunded this order." };
  }

  if (input.providerState === "completed") {
    return { action: "complete" };
  }

  if (input.providerState === "failed") {
    return { action: "fail", reason: "The supplier could not complete this order." };
  }

  if (input.providerState === null) {
    return input.ageMinutes >= MISSING_MINUTES
      ? {
          action: "escalate",
          reason: "The supplier has no record of this order.",
        }
      : { action: "wait" };
  }

  return input.ageMinutes >= STALE_MINUTES
    ? {
        action: "escalate",
        reason: "The supplier has left this order unfinished for too long.",
      }
    : { action: "wait" };
}

/** Minutes between an ISO timestamp and now, floored at zero. */
export function minutesSince(iso: string | null | undefined, now: number): number {
  if (!iso) {
    return 0;
  }

  const started = Date.parse(iso);

  return Number.isFinite(started) ? Math.max(0, (now - started) / 60_000) : 0;
}
