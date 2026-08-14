"use client";

import { useActionState } from "react";
import { FormResult, TextAreaField } from "@/components/admin/admin-form";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";
import type { AdminMessages } from "@/i18n/messages";
import {
  INITIAL_SUPPORT_QUEUE_STATE,
  type SupportQueueActionState,
} from "@/app/[locale]/dashboard/support/action-state";
import { replyAction, setStatusAction } from "@/app/[locale]/dashboard/support/actions";
import { SUPPORT_STATUSES, type SupportStatus } from "@/lib/support/status";

/**
 * Answering a request, and moving it out of the queue.
 *
 * Two separate forms rather than one with a status dropdown beside the reply
 * box: replying already moves a thread to "awaiting customer" through the
 * database trigger, so pairing the two controls would invite setting a status
 * that the reply is about to overwrite.
 */

type SupportMessages = AdminMessages["support"];

function errorText(state: SupportQueueActionState, messages: SupportMessages): string | null {
  if (!state.error) {
    return null;
  }

  return messages.errors[state.error as keyof typeof messages.errors] ?? messages.errors.unknown;
}

export function AdminReplyForm({
  locale,
  threadId,
  messages,
}: {
  locale: Locale;
  threadId: string;
  messages: SupportMessages;
}) {
  const [state, formAction, pending] = useActionState<SupportQueueActionState, FormData>(
    replyAction,
    INITIAL_SUPPORT_QUEUE_STATE,
  );

  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="threadId" value={threadId} />

      <FormResult error={errorText(state, messages)} />

      <TextAreaField
        label={messages.replyLabel}
        name="body"
        rows={4}
        maxLength={4000}
        required
      />

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? messages.sending : messages.replyAction}
        </Button>
      </div>
    </form>
  );
}

export function StatusButtons({
  locale,
  threadId,
  current,
  messages,
}: {
  locale: Locale;
  threadId: string;
  current: string;
  messages: SupportMessages;
}) {
  const [state, formAction, pending] = useActionState<SupportQueueActionState, FormData>(
    setStatusAction,
    INITIAL_SUPPORT_QUEUE_STATE,
  );

  return (
    <div className="grid gap-2">
      <FormResult error={errorText(state, messages)} />

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-[var(--ink-faint)]">
          {messages.statusActionLabel}
        </span>

        {SUPPORT_STATUSES.filter((status) => status !== current).map((status: SupportStatus) => (
          <form key={status} action={formAction}>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="threadId" value={threadId} />
            <input type="hidden" name="status" value={status} />
            <Button type="submit" variant="ghost" disabled={pending}>
              {messages.statuses[status]}
            </Button>
          </form>
        ))}
      </div>
    </div>
  );
}
