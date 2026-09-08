import { Badge } from "@/components/ui/badge";
import { StarIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";
import { formatMessage } from "@/i18n/messages";
import type { StoreReview } from "@/lib/services/reviews.service";
import { cn } from "@/lib/cn";

/**
 * Customer testimonial.
 *
 * The star row is decorative; the rating is announced from a single visually
 * hidden sentence so a screen reader hears "4 out of 5" instead of five
 * unlabelled icons.
 */
export type ReviewCardProps = {
  review: StoreReview;
  locale: Locale;
  labels: { ratingLabel: string; verified: string };
  className?: string;
};

const MAX_RATING = 5;

export function ReviewCard({ review, locale, labels, className }: ReviewCardProps) {
  const rating = Math.min(MAX_RATING, Math.max(1, review.rating));

  return (
    <figure
      className={cn(
        "flex h-full flex-col gap-4 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--elevation-1)]",
        className,
      )}
    >
      <div className="flex items-center gap-1 text-[var(--accent-3)]" aria-hidden="true">
        {Array.from({ length: MAX_RATING }, (_, index) => (
          <StarIcon key={index} filled={index < rating} className="size-4" />
        ))}
      </div>
      <span className="sr-only">{formatMessage(labels.ratingLabel, { rating }, locale)}</span>

      <blockquote className="flex-1 text-sm leading-6 text-[var(--ink-soft)]">
        <p>{review.body}</p>
      </blockquote>

      <figcaption className="flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-4">
        <span className="text-sm font-semibold text-[var(--ink)]">{review.displayName}</span>
        {review.isFeatured ? <Badge tone="accent">{labels.verified}</Badge> : null}
      </figcaption>
    </figure>
  );
}
