"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  INITIAL_MODERATION_STATE,
  type ReviewModerationState,
} from "@/app/[locale]/dashboard/reviews/action-state";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n/config";
import { requireAdmin } from "@/lib/auth/guards";
import { formText } from "@/lib/forms/form-data";
import { recordAudit } from "@/lib/services/admin-audit.service";
import { REVIEW_STATUSES } from "@/lib/reviews/status";
import { moderateReview } from "@/lib/services/reviews.service";

/**
 * Deciding what appears on the storefront.
 *
 * Publishing someone else's words under the store's name is exactly the kind of
 * act that should be attributable later, so every decision writes an audit row
 * alongside the `reviewed_by` stamp on the review itself. The two are not
 * redundant: the review says who decided last, the audit log says who decided
 * each time.
 */

const moderateSchema = z.object({
  locale: z.string().optional(),
  reviewId: z.uuid(),
  status: z.enum(REVIEW_STATUSES).optional(),
  adminNote: z.string().trim().max(500).optional(),
});

function resolveLocale(value: string | undefined): Locale {
  return value && isLocale(value) ? value : DEFAULT_LOCALE;
}

export async function moderateReviewAction(
  _state: ReviewModerationState,
  formData: FormData,
): Promise<ReviewModerationState> {
  const admin = await requireAdmin();

  const rawStatus = formText(formData, "status");
  const parsed = moderateSchema.safeParse({
    locale: formText(formData, "locale"),
    reviewId: formText(formData, "reviewId"),
    status: rawStatus || undefined,
    adminNote: formText(formData, "adminNote") ?? undefined,
  });

  if (!parsed.success) {
    return { ...INITIAL_MODERATION_STATE, error: "unknown" };
  }

  /*
   * Featuring is its own button, so an absent field means "leave it alone"
   * rather than "unfeature" — read as a tri-state, not a checkbox. A control
   * that silently unfeatured every review you added a note to is the sort of
   * thing nobody notices until the homepage strip has emptied.
   */
  const featureIntent = formText(formData, "feature");
  const isFeatured = featureIntent === undefined ? undefined : featureIntent === "true";

  const result = await moderateReview({
    reviewId: parsed.data.reviewId,
    status: parsed.data.status,
    isFeatured,
    adminNote: parsed.data.adminNote,
  });

  if (!result.ok) {
    return { ...INITIAL_MODERATION_STATE, error: result.reason };
  }

  await recordAudit({
    actorId: admin.id,
    action: "review.moderate",
    entityType: "review",
    entityId: parsed.data.reviewId,
    values: {
      status: parsed.data.status ?? null,
      isFeatured: isFeatured ?? null,
      noted: Boolean(parsed.data.adminNote),
    },
  });

  const locale = resolveLocale(parsed.data.locale);

  revalidatePath(`/${locale}/dashboard/reviews`);
  // The storefront strip reads approved reviews, so a decision changes it.
  revalidatePath("/", "layout");

  return { error: null, notice: "saved" };
}
