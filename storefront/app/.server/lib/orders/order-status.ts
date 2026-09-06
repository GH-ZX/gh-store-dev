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
