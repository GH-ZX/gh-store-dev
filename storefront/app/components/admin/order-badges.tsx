import { Badge, type BadgeTone } from "@/components/ui/badge";
import type { CheckoutMessages } from "@/i18n/messages";

/**
 * Status pills for the dashboard, worded from the customer-facing dictionary.
 *
 * The labels come from the `checkout` namespace rather than a second admin copy
 * of the same words: an operator reading "Delivering" and a customer reading
 * "Delivering" should be reading the same status, and one dictionary is the only
 * way to keep that true in both languages.
 *
 * Every lookup falls back to the raw database value. A status the copy does not
 * cover is a real thing that happened to a real order, and the dashboard is
 * where it must be visible — an empty pill would hide it.
 */

const ORDER_STATUS_TONES: Record<string, BadgeTone> = {
  pending: "neutral",
  payment_pending: "neutral",
  paid: "accent",
  processing: "accent",
  fulfilling: "accent",
  completed: "success",
  failed: "danger",
  refunded: "warning",
  cancelled: "neutral",
};

const PAYMENT_STATUS_TONES: Record<string, BadgeTone> = {
  pending: "neutral",
  paid: "success",
  failed: "danger",
  refunded: "warning",
  cancelled: "neutral",
};

const FULFILLMENT_TONES: Record<string, BadgeTone> = {
  pending: "neutral",
  processing: "accent",
  completed: "success",
  failed: "danger",
  refunded: "warning",
  reconcile: "warning",
};

function label(map: Record<string, string>, key: string): string {
  return map[key] ?? key;
}

export function OrderStatusBadge({
  messages,
  status,
}: {
  messages: CheckoutMessages;
  status: string;
}) {
  return (
    <Badge tone={ORDER_STATUS_TONES[status] ?? "neutral"}>{label(messages.statuses, status)}</Badge>
  );
}

export function PaymentStatusBadge({
  messages,
  status,
}: {
  messages: CheckoutMessages;
  status: string;
}) {
  return (
    <Badge tone={PAYMENT_STATUS_TONES[status] ?? "neutral"}>
      {label(messages.paymentStatuses, status)}
    </Badge>
  );
}

export function FulfillmentBadge({
  messages,
  state,
}: {
  messages: CheckoutMessages;
  state: string;
}) {
  return (
    <Badge tone={FULFILLMENT_TONES[state] ?? "neutral"}>
      {label(messages.fulfillmentStates, state)}
    </Badge>
  );
}
