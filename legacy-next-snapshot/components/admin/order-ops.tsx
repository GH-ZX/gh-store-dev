"use client";

import { useActionState } from "react";
import { AdminCard, FormResult, TextAreaField } from "@/components/admin/admin-form";
import { Button } from "@/components/ui/button";
import { AlertIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";
import type { AdminMessages } from "@/i18n/messages";
import {
  INITIAL_ORDER_OP_STATE,
  type OrderOpState,
} from "@/app/[locale]/dashboard/orders/action-state";
import {
  markDeliveredAction,
  refundOrderAction,
  resendDeliveryNotificationAction,
  retryFulfillmentAction,
} from "@/app/[locale]/dashboard/orders/actions";

type Messages = AdminMessages["orders"];
type ErrorKey = keyof Messages["errors"];
type OutcomeKey = keyof Messages["retryOutcomes"];

function resolveError(messages: Messages, key: string | null): string | null {
  return key ? (messages.errors[key as ErrorKey] ?? messages.errors.unknown) : null;
}

export type OrderOpsProps = {
  locale: Locale;
  messages: Messages;
  orderId: string;
  /** True once the order is completed, refunded, or cancelled. */
  settled: boolean;
  /** True when the order was delivered (completed): the notification can be resent. */
  delivered: boolean;
};

/**
 * The two ways an operator can move a stuck order.
 *
 * Each is its own form, so a stray Enter in the hand-delivery note can never
 * submit a retry, and each keeps its own result banner — after pressing one, the
 * operator should not have to work out which of the two the message belongs to.
 *
 * A settled order shows an explanation and (when delivered) the one thing still
 * useful: resending the delivery notification a settlement recorded outside the
 * dashboard never produced. The server refuses the moving operations on a
 * settled order regardless; hiding the controls means the refusal is read before
 * the click rather than after it.
 */
export function OrderOps({ locale, messages, orderId, settled, delivered }: OrderOpsProps) {
  const [retryState, retry, retrying] = useActionState<OrderOpState, FormData>(
    retryFulfillmentAction,
    INITIAL_ORDER_OP_STATE,
  );
  const [deliverState, deliver, delivering] = useActionState<OrderOpState, FormData>(
    markDeliveredAction,
    INITIAL_ORDER_OP_STATE,
  );
  const [refundState, refund, refunding] = useActionState<OrderOpState, FormData>(
    refundOrderAction,
    INITIAL_ORDER_OP_STATE,
  );
  const [resendState, resend, resending] = useActionState<OrderOpState, FormData>(
    resendDeliveryNotificationAction,
    INITIAL_ORDER_OP_STATE,
  );

  const busy = retrying || delivering || refunding;

  /*
   * A retry reports what the supplier actually did, not just "done" — an order
   * that came back "processing" still needs watching. An outcome the copy does
   * not cover falls back to the processing wording, which asks the operator to
   * refresh and look, rather than claiming a success or a failure we cannot see.
   */
  const retryNotice =
    retryState.notice === "retried"
      ? (messages.retryOutcomes[retryState.outcome as OutcomeKey] ??
        messages.retryOutcomes.processing)
      : null;

  return (
    <AdminCard title={messages.opsTitle} description={messages.opsDescription}>
      {settled ? (
        <div className="grid gap-4">
          <p
            className="flex items-start gap-2 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm leading-6 text-[var(--ink-muted)]"
            role="note"
          >
            <AlertIcon className="mt-0.5 size-4 shrink-0 text-[var(--ink-faint)]" />
            {messages.opsSettled}
          </p>

          {delivered ? (
            <form action={resend} className="grid gap-3 border-t border-[var(--line)] pt-4">
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="orderId" value={orderId} />

              <div>
                <h3 className="text-sm font-semibold text-[var(--ink)]">{messages.resendTitle}</h3>
                <p className="mt-1 text-sm leading-6 text-[var(--ink-muted)]">
                  {messages.resendDescription}
                </p>
              </div>

              <div>
                <Button type="submit" variant="secondary" disabled={resending || busy}>
                  {messages.resendAction}
                </Button>
              </div>

              <FormResult
                error={resolveError(messages, resendState.error)}
                notice={
                  resendState.notice === "delivery_notification_sent" ? messages.resendSent : null
                }
              />
            </form>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-6">
          <form action={retry} className="grid gap-3">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="orderId" value={orderId} />

            <div>
              <h3 className="text-sm font-semibold text-[var(--ink)]">{messages.retryTitle}</h3>
              <p className="mt-1 text-sm leading-6 text-[var(--ink-muted)]">
                {messages.retryDescription}
              </p>
            </div>

            <div>
              <Button type="submit" disabled={busy}>
                {messages.retryAction}
              </Button>
            </div>

            <FormResult error={resolveError(messages, retryState.error)} notice={retryNotice} />
          </form>

          <form action={refund} className="grid gap-3 border-t border-[var(--line)] pt-6">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="orderId" value={orderId} />

            <div>
              <h3 className="text-sm font-semibold text-[var(--ink)]">{messages.refundTitle}</h3>
              <p className="mt-1 text-sm leading-6 text-[var(--ink-muted)]">
                {messages.refundDescription}
              </p>
            </div>

            <TextAreaField
              label={messages.refundNoteLabel}
              hint={messages.refundNoteHint}
              name="note"
              required
              minLength={3}
              maxLength={280}
            />

            <div>
              <Button type="submit" variant="secondary" disabled={busy}>
                {messages.refundAction}
              </Button>
            </div>

            <FormResult
              error={resolveError(messages, refundState.error)}
              notice={refundState.notice === "refunded_manually" ? messages.refundedManually : null}
            />
          </form>

          <form action={deliver} className="grid gap-3 border-t border-[var(--line)] pt-6">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="orderId" value={orderId} />

            <div>
              <h3 className="text-sm font-semibold text-[var(--ink)]">{messages.deliverTitle}</h3>
              <p className="mt-1 text-sm leading-6 text-[var(--ink-muted)]">
                {messages.deliverDescription}
              </p>
            </div>

            <TextAreaField
              label={messages.deliverNoteLabel}
              hint={messages.deliverNoteHint}
              name="note"
              required
              minLength={3}
              maxLength={280}
            />

            <div>
              <Button type="submit" variant="secondary" disabled={busy}>
                {messages.deliverAction}
              </Button>
            </div>

            <FormResult
              error={resolveError(messages, deliverState.error)}
              notice={deliverState.notice === "marked_delivered" ? messages.markedDelivered : null}
            />
          </form>
        </div>
      )}
    </AdminCard>
  );
}
