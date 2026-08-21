import type { Json } from "@/types/database";

/**
 * Whether terminal provider failures automatically return a wallet customer's
 * money. Refunds are the safe default: an unset or malformed setting must never
 * leave a customer charged without an explicit owner decision.
 */
export const DEFAULT_REFUND_ON_FULFILLMENT_FAILURE = true;

export type FulfillmentSettings = {
  refundOnFailure: boolean;
};

export function readRefundOnFulfillmentFailure(payments: unknown): boolean {
  if (payments && typeof payments === "object" && !Array.isArray(payments)) {
    const value = (payments as { refund_on_fulfillment_failure?: Json }).refund_on_fulfillment_failure;

    if (typeof value === "boolean") {
      return value;
    }
  }

  return DEFAULT_REFUND_ON_FULFILLMENT_FAILURE;
}

export function mergeRefundOnFulfillmentFailure(
  payments: Json | null | undefined,
  refundOnFailure: boolean,
): Json {
  const base: Record<string, Json | undefined> =
    payments && typeof payments === "object" && !Array.isArray(payments) ? { ...payments } : {};

  base.refund_on_fulfillment_failure = refundOnFailure;

  return base;
}
