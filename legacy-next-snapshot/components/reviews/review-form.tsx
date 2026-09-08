"use client";

import { useActionState } from "react";
import { FormResult, TextAreaField, TextField } from "@/components/admin/admin-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StarIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";
import { formatMessage } from "@/i18n/format";
import type { CheckoutMessages } from "@/i18n/messages";
import {
  INITIAL_REVIEW_STATE,
  type ReviewActionState,
} from "@/app/[locale]/orders/[orderId]/action-state";
import { submitReviewAction } from "@/app/[locale]/orders/[orderId]/actions";
import type { MyReview } from "@/lib/services/reviews.service";

/**
 * Reviewing a delivered order.
 *
 * Shown once the order is complete, and replaced by the customer's own words the
 * moment they have written them — including while the review is still waiting for
 * approval. A form that reappears after submitting reads as though the first
 * attempt failed.
 *
 * The rating is a radio group rather than a star widget: it works without
 * JavaScript, it is reachable by keyboard for nothing, and a screen reader gets
 * five labelled options instead of five identical buttons.
 */

type ReviewMessages = CheckoutMessages["review"];

const RATINGS = [5, 4, 3, 2, 1] as const;

export function ReviewForm({
  locale,
  orderId,
  defaultName,
  existing,
  messages,
}: {
  locale: Locale;
  orderId: string;
  defaultName: string;
  /** The review already left for this order, if any. */
  existing: MyReview | null;
  messages: ReviewMessages;
}) {
  const [state, formAction, pending] = useActionState<ReviewActionState, FormData>(
    submitReviewAction,
    INITIAL_REVIEW_STATE,
  );

  if (existing) {
    return (
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold text-[var(--ink)]">{messages.yoursTitle}</h2>
          <Badge tone={existing.status === "approved" ? "success" : "neutral"}>
            {messages.statuses[existing.status as keyof typeof messages.statuses] ??
              existing.status}
          </Badge>
        </div>

        <p className="text-sm text-[var(--ink-muted)]">
          {formatMessage(messages.ratingGiven, { rating: existing.rating }, locale)}
        </p>

        <p className="text-sm leading-6 whitespace-pre-wrap text-[var(--ink)]">{existing.body}</p>

        {existing.status === "pending" ? (
          <p className="text-xs text-[var(--ink-faint)]">{messages.pendingNote}</p>
        ) : null}
      </div>
    );
  }

  if (state.notice) {
    return <FormResult notice={messages.thanks} />;
  }

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="orderId" value={orderId} />

      <div>
        <h2 className="text-base font-semibold text-[var(--ink)]">{messages.title}</h2>
        <p className="mt-1 text-sm text-[var(--ink-muted)]">{messages.description}</p>
      </div>

      <FormResult
        error={
          state.error
            ? (messages.errors[state.error as keyof typeof messages.errors] ??
              messages.errors.unknown)
            : null
        }
      />

      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium text-[var(--ink)]">{messages.ratingLabel}</legend>

        <div className="flex flex-wrap gap-2">
          {RATINGS.map((value) => (
            <label
              key={value}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink-soft)] transition-colors duration-[var(--duration)] hover:border-[var(--line-strong)] has-checked:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] has-checked:bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] has-checked:text-[var(--ink)]"
            >
              <input
                type="radio"
                name="rating"
                value={value}
                defaultChecked={value === 5}
                required
                className="sr-only"
              />
              <StarIcon filled className="size-3.5 text-[var(--accent)]" />
              <span className="tabular-nums">{value}</span>
              <span className="sr-only">
                {formatMessage(messages.ratingOption, { rating: value }, locale)}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <TextField
        label={messages.nameLabel}
        hint={messages.nameHint}
        name="displayName"
        defaultValue={defaultName}
        maxLength={80}
        required
      />

      <TextAreaField
        label={messages.bodyLabel}
        name="body"
        rows={4}
        maxLength={2000}
        required
      />

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? messages.sending : messages.submitAction}
        </Button>
      </div>
    </form>
  );
}
