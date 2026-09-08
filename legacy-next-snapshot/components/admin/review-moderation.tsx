"use client";

import { useActionState } from "react";
import { FormResult, TextField } from "@/components/admin/admin-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StarIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";
import { formatMessage } from "@/i18n/format";
import type { AdminMessages } from "@/i18n/messages";
import {
  INITIAL_MODERATION_STATE,
  type ReviewModerationState,
} from "@/app/[locale]/dashboard/reviews/action-state";
import { moderateReviewAction } from "@/app/[locale]/dashboard/reviews/actions";
import type { AdminReview } from "@/lib/services/reviews.service";

/**
 * One review, with the decisions that can be made about it.
 *
 * Each decision is its own submit button inside one form, so the private note
 * travels with whichever button was pressed and an administrator can approve and
 * annotate in a single act. Buttons carry their intent as a `value`, which is
 * why the action reads `status` and `feature` as tri-states: a field that was
 * not submitted means "leave this alone", not "set it false".
 */

type ReviewMessages = AdminMessages["reviews"];

export function ReviewModerationCard({
  locale,
  review,
  messages,
}: {
  locale: Locale;
  review: AdminReview;
  messages: ReviewMessages;
}) {
  const [state, formAction, pending] = useActionState<ReviewModerationState, FormData>(
    moderateReviewAction,
    INITIAL_MODERATION_STATE,
  );

  const error = state.error
    ? (messages.errors[state.error as keyof typeof messages.errors] ?? messages.errors.unknown)
    : null;

  return (
    <li className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-[var(--ink)]">{review.displayName}</span>

          <span className="inline-flex items-center gap-1 text-sm text-[var(--ink-soft)]">
            <StarIcon filled className="size-3.5 text-[var(--accent)]" />
            <span className="tabular-nums" dir="ltr">
              {review.rating}
            </span>
            <span className="sr-only">
              {formatMessage(messages.ratingLabel, { rating: review.rating }, locale)}
            </span>
          </span>

          <Badge
            tone={
              review.status === "approved"
                ? "success"
                : review.status === "rejected"
                  ? "danger"
                  : "neutral"
            }
          >
            {messages.statuses[review.status as keyof typeof messages.statuses] ?? review.status}
          </Badge>

          {review.isFeatured ? <Badge tone="accent">{messages.featuredLabel}</Badge> : null}

          <span className="font-mono text-xs text-[var(--ink-faint)]" dir="ltr">
            {review.locale}
          </span>
        </div>

        <time
          className="text-xs text-[var(--ink-faint)] tabular-nums"
          dateTime={review.createdAt}
          dir="ltr"
        >
          {review.createdAt.slice(0, 16).replace("T", " ")}
        </time>
      </div>

      {/* A stranger's words: rendered as text, never as markup. */}
      <p className="mt-3 text-sm leading-6 whitespace-pre-wrap text-[var(--ink)]">{review.body}</p>

      <form action={formAction} className="mt-4 grid gap-3 border-t border-[var(--line)] pt-4">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="reviewId" value={review.id} />

        <FormResult error={error} />

        <TextField
          label={messages.noteLabel}
          hint={messages.noteHint}
          name="adminNote"
          defaultValue={review.adminNote ?? ""}
          maxLength={500}
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" name="status" value="approved" disabled={pending}>
            {pending ? messages.saving : messages.approveAction}
          </Button>

          <Button
            type="submit"
            name="status"
            value="rejected"
            variant="secondary"
            disabled={pending}
          >
            {messages.rejectAction}
          </Button>

          <Button
            type="submit"
            name="feature"
            value={review.isFeatured ? "false" : "true"}
            variant="ghost"
            disabled={pending}
          >
            {review.isFeatured ? messages.unfeatureAction : messages.featureAction}
          </Button>
        </div>
      </form>
    </li>
  );
}
