import { PAGE_SIZE, pageRange } from "@server/lib/paging";
import type { ReviewStatus } from "@server/lib/reviews/status";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@server/types/database";
import type { Locale } from "@/i18n/config";
import { requireUserId, requireAdminId } from "@server/lib/auth/guards";
import { logOutcome } from "@server/lib/logging/logger";
export type MyReview = {
  id: string;
  rating: number;
  body: string;
  status: string;
  createdAt: string;
};

export type SubmitReviewResult =
  | { ok: true }
  | {
      ok: false;
      reason: "invalid_input" | "not_eligible" | "already_reviewed" | "unknown";
    };

const BODY_MAX = 2000;
const NAME_MAX = 80;

/** Postgres' unique-violation code, which is how a second review announces itself. */
const UNIQUE_VIOLATION = "23505";

/**
 * The caller's own review of an order, if they left one.
 *
 * Used to decide whether to offer the form or show what was already written —
 * including while it is still `pending`, because a customer who reviewed
 * yesterday should see their words rather than an empty form inviting them to
 * repeat themselves.
 */
export async function getMyReviewForOrder(supabase: SupabaseClient<Database>, orderId: string): Promise<MyReview | null> {
  const user = await requireUserId(supabase);

  const { data } = await supabase
    .from("reviews")
    .select("id, rating, body, status, created_at")
    .eq("order_id", orderId)
    .eq("user_id", user.id)
    .maybeSingle();

  return data
    ? {
        id: data.id,
        rating: data.rating,
        body: data.body,
        status: data.status,
        createdAt: data.created_at,
      }
    : null;
}

/**
 * Leave a review for a delivered order.
 *
 * Gated on the order rather than open to anyone signed in: a testimonial strip
 * is only worth believing if the people in it bought something. The eligibility
 * read is scoped by RLS to the caller's own orders, so someone else's order id
 * is simply not found.
 *
 * `status` and `is_featured` are never sent. The insert policy pins them to
 * `pending` and `false`, and setting them here would only obscure which layer is
 * actually the authority — a review reaches the storefront when an administrator
 * approves it and at no other moment.
 */
export async function submitReview(supabase: SupabaseClient<Database>, input: {
  orderId: string;
  rating: number;
  body: string;
  displayName: string;
  locale: Locale;
}): Promise<SubmitReviewResult> {
  const result = await attemptReview(supabase, input);

  logOutcome("reviews", "review_submitted", result, {
    orderId: input.orderId,
    rating: input.rating,
  });

  return result;
}

async function attemptReview(supabase: SupabaseClient<Database>, input: {
  orderId: string;
  rating: number;
  body: string;
  displayName: string;
  locale: Locale;
}): Promise<SubmitReviewResult> {
  const user = await requireUserId(supabase);

  const body = input.body.trim();
  const displayName = input.displayName.trim().slice(0, NAME_MAX);
  const rating = Math.trunc(input.rating);

  if (rating < 1 || rating > 5 || body.length === 0 || body.length > BODY_MAX) {
    return { ok: false, reason: "invalid_input" };
  }

  if (displayName.length === 0) {
    return { ok: false, reason: "invalid_input" };
  }

  const { data: order } = await supabase
    .from("orders")
    .select("id, status")
    .eq("id", input.orderId)
    .eq("user_id", user.id)
    .maybeSingle();

  // Not found, someone else's, or not delivered yet all mean the same thing to a
  // customer: there is nothing here to review.
  if (!order || order.status !== "completed") {
    return { ok: false, reason: "not_eligible" };
  }

  const { error } = await supabase.from("reviews").insert({
    user_id: user.id,
    order_id: input.orderId,
    display_name: displayName,
    rating,
    body,
    locale: input.locale,
  });

  if (error) {
    return error.code === UNIQUE_VIOLATION
      ? { ok: false, reason: "already_reviewed" }
      : { ok: false, reason: "unknown" };
  }

  return { ok: true };
}

export type AdminReview = {
  id: string;
  displayName: string;
  rating: number;
  body: string;
  locale: string;
  status: string;
  isFeatured: boolean;
  adminNote: string | null;
  orderId: string | null;
  createdAt: string;
  reviewedAt: string | null;
};

export type AdminReviewsResult =
  | { ok: true; reviews: AdminReview[]; total: number }
  | { ok: false };

export type ModerateResult = { ok: true } | { ok: false; reason: "not_found" | "unknown" };

/**
 * Reviews awaiting a decision, and the ones already decided.
 *
 * Defaults to `pending` at the call site rather than here: the queue's whole
 * purpose is the undecided ones, but "show me what I published" is a fair
 * question and the same query answers it.
 */
export async function getReviewsForModeration(supabase: SupabaseClient<Database>, options: {
  status?: ReviewStatus | "all";
  page?: number;
}): Promise<AdminReviewsResult> {
  await requireAdminId(supabase);

  const { from, to } = pageRange(options.page ?? 1, PAGE_SIZE);

  let query = supabase
    .from("reviews")
    .select(
      "id, display_name, rating, body, locale, status, is_featured, admin_note, order_id, created_at, reviewed_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  if (options.status && options.status !== "all") {
    query = query.eq("status", options.status);
  }

  const { data, error, count } = await query;

  if (error) {
    return { ok: false };
  }

  const reviews = (data ?? []).map((row) => ({
    id: row.id,
    displayName: row.display_name,
    rating: row.rating,
    body: row.body,
    locale: row.locale,
    status: row.status,
    isFeatured: row.is_featured,
    adminNote: row.admin_note,
    orderId: row.order_id,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
  }));

  return { ok: true, reviews, total: count ?? reviews.length };
}

/**
 * Decide a review.
 *
 * `reviewed_by` and `reviewed_at` are stamped here rather than by a trigger,
 * because the decision has an author and the row is the only place that records
 * who it was. Featuring is folded into the same call: it is another thing an
 * administrator decides about a review, and splitting it would mean two audit
 * rows for one visit to the page.
 */
export async function moderateReview(supabase: SupabaseClient<Database>, input: {
  reviewId: string;
  status?: ReviewStatus;
  isFeatured?: boolean;
  adminNote?: string | null;
}): Promise<ModerateResult> {
  const admin = await requireAdminId(supabase);

  const { data, error } = await supabase
    .from("reviews")
    .update({
      ...(input.status ? { status: input.status } : {}),
      ...(input.isFeatured === undefined ? {} : { is_featured: input.isFeatured }),
      ...(input.adminNote === undefined ? {} : { admin_note: input.adminNote }),
      reviewed_by: admin.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", input.reviewId)
    .select("id")
    .maybeSingle();

  const result: ModerateResult = error
    ? { ok: false, reason: "unknown" }
    : data
      ? { ok: true }
      : { ok: false, reason: "not_found" };

  logOutcome("reviews", "review_moderated", result, {
    reviewId: input.reviewId,
    status: input.status ?? null,
    isFeatured: input.isFeatured ?? null,
  });

  return result;
}
