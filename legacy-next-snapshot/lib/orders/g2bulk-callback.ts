/**
 * What to do about a G2Bulk callback.
 *
 * The supplier POSTs once an order reaches a terminal state, and says it may
 * repeat that POST after a failed delivery. So the receiver is asked the same
 * question twice for one event, and sometimes asked a question that contradicts
 * what the store already did — a `FAILED` for an order we finished, or a
 * `COMPLETED` for one we already refunded.
 *
 * The decision is here, apart from the delivery of it, because it is the part
 * worth testing: the edge function that receives the callback runs on Deno and
 * cannot be reached by this project's test runner, and "settle the order" is not
 * a rule anybody should be reading out of an HTTP handler.
 *
 * Deliberately free of imports so the Deno function can load it directly. A copy
 * of these rules living beside the handler is how the two would drift.
 */

/** The terminal states G2Bulk sends. Anything else is not an outcome. */
export type CallbackStatus = "completed" | "failed" | "unsupported";

/** What the store already believes about this order. */
export type AttemptState = {
  /** `fulfillment_attempts.status`. */
  status: string;
  /** The order's own number, for checking the callback is about what it claims. */
  orderNumber: string;
};

export type CallbackDecision =
  | { action: "complete" }
  | { action: "refund"; reason: string }
  | { action: "ignore"; reason: string }
  | { action: "conflict"; reason: string };

/** Statuses that mean the store has already settled, one way or the other. */
const SETTLED = new Set(["completed", "refunded"]);

export function classifyCallbackStatus(value: unknown): CallbackStatus {
  const status = typeof value === "string" ? value.trim().toUpperCase() : "";

  if (status === "COMPLETED" || status === "SUCCESS" || status === "SUCCESSFUL") {
    return "completed";
  }

  if (status === "FAILED" || status === "FAILURE" || status === "CANCELLED" || status === "CANCELED") {
    return "failed";
  }

  /*
   * `PENDING` arrives here too, from a supplier that decides to report progress.
   * It is not an outcome, and treating an unrecognised word as either one would
   * be the expensive kind of guess.
   */
  return "unsupported";
}

/**
 * Decide, given the callback and what the store already knows.
 *
 * The callback is a claim, not an instruction — the same stance the Sam payment
 * callback takes. It is checked against the attempt before anything moves, and
 * where the two disagree the answer is never to pick one: a `conflict` settles
 * nothing, leaves the order exactly as it is, and says so where an operator will
 * see it. Automatically un-completing a delivered order, or re-charging a
 * customer whose refund already landed, are both worse than a wait.
 */
export function decideCallback(input: {
  status: CallbackStatus;
  attempt: AttemptState;
  /** The `remark` we sent at purchase, echoed back — our own order number. */
  remark: string | null;
}): CallbackDecision {
  const { status, attempt, remark } = input;

  if (status === "unsupported") {
    return { action: "ignore", reason: "Not a terminal status." };
  }

  /*
   * The remark is checked only when present. It is our own order number sent at
   * purchase and echoed back, so a mismatch means this callback is about a
   * different order than the supplier id resolved to — and the id is the thing
   * everything else here trusts.
   */
  if (remark !== null && remark.trim().length > 0 && remark.trim() !== attempt.orderNumber) {
    return {
      action: "conflict",
      reason: `The callback names order ${remark.trim()}, but that supplier order belongs to ${attempt.orderNumber}.`,
    };
  }

  if (status === "completed") {
    if (attempt.status === "completed") {
      return { action: "ignore", reason: "Already completed." };
    }

    if (attempt.status === "refunded") {
      return {
        action: "conflict",
        reason: "The supplier reports this delivered, but it was already failed and refunded.",
      };
    }

    return { action: "complete" };
  }

  if (SETTLED.has(attempt.status)) {
    return attempt.status === "refunded"
      ? { action: "ignore", reason: "Already refunded." }
      : {
          action: "conflict",
          reason: "The supplier reports this failed, but it was already completed for the customer.",
        };
  }

  return { action: "refund", reason: "The supplier could not complete this order." };
}

/**
 * The key that makes a repeated callback harmless.
 *
 * `fulfillment_events` is unique on `(provider, external_event_id)` and G2Bulk
 * sends no event id of its own, so one is derived. A supplier order reaches each
 * terminal state once, which makes the pair a natural key — and deliberately not
 * the timestamp, since a retry of the same event may well carry a new one and
 * would then look like a second event.
 */
export function callbackEventId(externalOrderId: string, status: CallbackStatus): string {
  return `${externalOrderId}:${status}`;
}
