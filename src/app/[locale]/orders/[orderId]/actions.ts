"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  INITIAL_REVIEW_STATE,
  type ReviewActionState,
} from "@/app/[locale]/orders/[orderId]/action-state";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n/config";
import { formText } from "@/lib/forms/form-data";
import { submitReview } from "@/lib/services/reviews.service";

/**
 * Leaving a review for an order.
 *
 * Shape only. Whether this customer may review this order is decided in the
 * service, against the order's own status and ownership, and the insert policy
 * has the final word on what the row is allowed to say.
 */

const reviewSchema = z.object({
  locale: z.string().optional(),
  orderId: z.uuid(),
  rating: z.coerce.number().int().min(1).max(5),
  displayName: z.string().trim().min(1).max(80),
  body: z.string().trim().min(1).max(2000),
});

function resolveLocale(value: string | undefined): Locale {
  return value && isLocale(value) ? value : DEFAULT_LOCALE;
}

export async function submitReviewAction(
  _state: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  const parsed = reviewSchema.safeParse({
    locale: formText(formData, "locale"),
    orderId: formText(formData, "orderId"),
    rating: formText(formData, "rating"),
    displayName: formText(formData, "displayName"),
    body: formText(formData, "body"),
  });

  if (!parsed.success) {
    return { ...INITIAL_REVIEW_STATE, error: "invalid_input" };
  }

  const locale = resolveLocale(parsed.data.locale);
  const result = await submitReview({
    orderId: parsed.data.orderId,
    rating: parsed.data.rating,
    body: parsed.data.body,
    displayName: parsed.data.displayName,
    locale,
  });

  if (!result.ok) {
    return { ...INITIAL_REVIEW_STATE, error: result.reason };
  }

  revalidatePath(`/${locale}/orders/${parsed.data.orderId}`);

  return { error: null, notice: "submitted" };
}
