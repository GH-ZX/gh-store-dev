/**
 * The states a review can be in.
 *
 * Outside the service so the moderation controls — a client component — can name
 * them without pulling `server-only` into the browser bundle.
 *
 * Mirrors the check constraint on `reviews.status`. `pending` is the only value a
 * customer's own insert may carry; the other two are an administrator's decision,
 * which is enforced by the insert policy rather than by anything here.
 */

export const REVIEW_STATUSES = ["pending", "approved", "rejected"] as const;

export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export function isReviewStatus(value: string): value is ReviewStatus {
  return (REVIEW_STATUSES as readonly string[]).includes(value);
}
