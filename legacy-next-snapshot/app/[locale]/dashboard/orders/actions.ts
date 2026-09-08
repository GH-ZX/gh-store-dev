"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n/config";
import { requireAdmin } from "@/lib/auth/guards";
import { formText } from "@/lib/forms/form-data";
import {
  markDelivered,
  OrderOpError,
  refundOrderManually,
  resendDeliveryNotification,
  retryFulfillment,
} from "@/lib/services/admin-order-ops.service";
import {
  INITIAL_ORDER_OP_STATE,
  type OrderOpState,
} from "@/app/[locale]/dashboard/orders/action-state";

const retrySchema = z.object({
  orderId: z.uuid(),
  locale: z.string().optional(),
});

const deliverSchema = retrySchema.extend({
  // Required: a hand-made completion with no explanation is unreadable later.
  note: z.string().trim().min(3).max(280),
});

function resolveLocale(value: string | undefined): Locale {
  return value && isLocale(value) ? value : DEFAULT_LOCALE;
}

function refresh(locale: Locale, orderId: string): void {
  revalidatePath(`/${locale}/dashboard/orders`);
  revalidatePath(`/${locale}/dashboard/orders/${orderId}`);
  // A delivery or refund changes what the customer sees too.
  revalidatePath("/", "layout");
}

function toError(error: unknown): OrderOpState {
  if (error instanceof OrderOpError) {
    return { ...INITIAL_ORDER_OP_STATE, error: error.reason };
  }

  return { ...INITIAL_ORDER_OP_STATE, error: "unknown" };
}

export async function retryFulfillmentAction(
  _state: OrderOpState,
  formData: FormData,
): Promise<OrderOpState> {
  await requireAdmin();

  const parsed = retrySchema.safeParse({
    orderId: formText(formData, "orderId"),
    locale: formText(formData, "locale"),
  });

  if (!parsed.success) {
    return { ...INITIAL_ORDER_OP_STATE, error: "invalid_input" };
  }

  try {
    const result = await retryFulfillment(parsed.data.orderId);
    refresh(resolveLocale(parsed.data.locale), parsed.data.orderId);

    return { error: null, notice: "retried", outcome: result.state };
  } catch (error) {
    return toError(error);
  }
}

export async function refundOrderAction(
  _state: OrderOpState,
  formData: FormData,
): Promise<OrderOpState> {
  await requireAdmin();

  const parsed = deliverSchema.safeParse({
    orderId: formText(formData, "orderId"),
    note: formText(formData, "note"),
    locale: formText(formData, "locale"),
  });

  if (!parsed.success) {
    return { ...INITIAL_ORDER_OP_STATE, error: "note_required" };
  }

  try {
    await refundOrderManually(parsed.data.orderId, parsed.data.note);
    refresh(resolveLocale(parsed.data.locale), parsed.data.orderId);

    return { error: null, notice: "refunded_manually", outcome: null };
  } catch (error) {
    return toError(error);
  }
}

export async function markDeliveredAction(
  _state: OrderOpState,
  formData: FormData,
): Promise<OrderOpState> {
  await requireAdmin();

  const parsed = deliverSchema.safeParse({
    orderId: formText(formData, "orderId"),
    note: formText(formData, "note"),
    locale: formText(formData, "locale"),
  });

  if (!parsed.success) {
    return { ...INITIAL_ORDER_OP_STATE, error: "note_required" };
  }

  try {
    await markDelivered(parsed.data.orderId, parsed.data.note);
    refresh(resolveLocale(parsed.data.locale), parsed.data.orderId);

    return { error: null, notice: "marked_delivered", outcome: null };
  } catch (error) {
    return toError(error);
  }
}

/**
 * Re-send the standard delivery notification to the customer.
 *
 * For a delivery recorded outside the dashboard (so no notification was ever
 * produced), on an order the other operators have nothing left to do. The
 * service only allows this on a completed order and only ever writes a
 * notification — no state, goods, or wallet.
 */
export async function resendDeliveryNotificationAction(
  _state: OrderOpState,
  formData: FormData,
): Promise<OrderOpState> {
  await requireAdmin();

  const parsed = retrySchema.safeParse({
    orderId: formText(formData, "orderId"),
    locale: formText(formData, "locale"),
  });

  if (!parsed.success) {
    return { ...INITIAL_ORDER_OP_STATE, error: "invalid_input" };
  }

  try {
    await resendDeliveryNotification(parsed.data.orderId);
    refresh(resolveLocale(parsed.data.locale), parsed.data.orderId);

    return { error: null, notice: "delivery_notification_sent", outcome: null };
  } catch (error) {
    return toError(error);
  }
}
