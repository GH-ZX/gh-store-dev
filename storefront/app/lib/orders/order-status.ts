/**
 * Orders that are closed to any further hand-over of goods.
 *
 * A completed order has already been delivered, so delivering it again would be
 * a second gift. A refunded or cancelled one has had its money returned, so
 * delivering it now would be a first gift. Both refusals protect the same thing:
 * stock leaving the store without being paid for.
 *
 * Kept here rather than inside the service so the dashboard can hide the
 * controls using the same rule the server enforces. The check is deliberately
 * repeated on the server anyway — this predicate decides what a button looks
 * like, never whether the goods actually move.
 */
const SETTLED_ORDER_STATUSES = new Set(["completed", "refunded", "cancelled"]);

export function isSettledOrderStatus(status: string): boolean {
  return SETTLED_ORDER_STATUSES.has(status);
}

/**
 * `held`: the customer paid, the goods are not out, and the store is waiting on
 * a supplier wallet the owner controls. Money has already moved and must not
 * move again — a held order is never refunded by the sweep and never bought by
 * it, and it becomes deliverable the moment the owner recharges.
 *
 * `processing` is not in this set: an order only reaches `held` through
 * {@link isHeldOrderStatus}, which the write path sets explicitly. `processing`
 * also covers orders a supplier is genuinely still working on, so treating the
 * status itself as held would mislabel them.
 */
export function isHeldOrderStatus(status: string): boolean {
  return status === "held";
}

/**
 * The supplier's answer that puts an order on hold rather than failing it.
 *
 * A wallet the store owns being empty is a temporary condition the owner can
 * fix, not a reason to refund a customer and lose the sale — so this error is
 * classified before the terminal-failure branch, and an order matching it is
 * held instead of failed.
 *
 * Deliberately loose, and deliberately small: the message is checked for the
 * words suppliers actually use for "your account has no money", in English and
 * Arabic. A rejected request or a bad key never matches, so a wrong player id
 * still fails and refunds as it should.
 */
export function isLowBalanceError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : typeof error === "string"
        ? error.toLowerCase()
        : "";

  if (!message) {
    return false;
  }

  return (
    message.includes("balance") ||
    message.includes("fund") ||
    message.includes("credit") ||
    // Not a bare "insufficient": suppliers use the same word for empty stock
    // ("Insufficient stock for product #16"), and holding a sold-out order is a
    // different problem with a different owner action.
    /insufficient\s+(account\s+)?(balance|funds|credit|wallet)/.test(message) ||
    message.includes("low_funds") ||
    message.includes("رصيد") ||
    message.includes("غير كاف")
  );
}

/** The `error_code` a held attempt carries, so the queue can recognise it. */
export const INSUFFICIENT_BALANCE_CODE = "insufficient_balance";

/**
 * Orders shown in the dashboard's held queue, newest hold first.
 *
 * `held` is the real state. `processing` and `fulfilling` are included because
 * three orders are already stuck in that limbo from before the hold state
 * existed, and they carry the same `insufficient_balance` attempt — see
 * {@link isHeldOrderLike}. Their status is never rewritten; the read side is
 * tolerant instead, so they surface with the same "I recharged — deliver now"
 * button and can finally be delivered.
 */
export const HELD_QUEUE_FILTER = "held";

/** Statuses that can be in the held queue (the transient ones only as legacy). */
export const HELD_LIKE_STATUSES = ["held", "processing", "fulfilling"] as const;

/**
 * Whatever an attempt row happens to look like at the call site.
 *
 * Both spellings are accepted because two different readers exist: the admin
 * services hold raw PostgREST rows (`error_code`) while the dashboard's typed
 * view uses camelCase. One predicate, so they can never disagree about which
 * order is waiting on supplier funds.
 */
export type HeldAttemptFacts = {
  errorCode?: string | null;
  errorMessage?: string | null;
  error_code?: string | null;
  error_message?: string | null;
};

/** True when an attempt row records the supplier refusing for lack of funds. */
export function hasInsufficientBalanceAttempt(attempts: HeldAttemptFacts[]): boolean {
  return attempts.some((attempt) => {
    const code = attempt.errorCode ?? attempt.error_code ?? "";
    const message = attempt.errorMessage ?? attempt.error_message ?? "";

    return code.toLowerCase() === INSUFFICIENT_BALANCE_CODE || isLowBalanceError(message);
  });
}

/**
 * Whether the dashboard should treat this order as waiting on supplier funds.
 *
 * Order-level, so the list, the detail page and the deliver button can never
 * disagree about which orders the held queue contains.
 */
export function isHeldOrderLike(
  status: string,
  attempts: HeldAttemptFacts[],
): boolean {
  if (isHeldOrderStatus(status)) {
    return true;
  }

  return (HELD_LIKE_STATUSES as readonly string[]).includes(status)
    ? hasInsufficientBalanceAttempt(attempts)
    : false;
}
