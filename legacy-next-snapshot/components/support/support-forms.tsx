"use client";

import { useActionState } from "react";
import { FormResult, TextAreaField, TextField } from "@/components/admin/admin-form";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";
import type { AccountMessages } from "@/i18n/messages";
import {
  INITIAL_SUPPORT_STATE,
  type SupportActionState,
} from "@/app/[locale]/support/action-state";
import { openThreadAction, replyAction } from "@/app/[locale]/support/actions";

/**
 * The two things a customer can do with support.
 *
 * Client components only because a form result has to render without a
 * navigation. Everything they submit is checked again on the server, and the
 * database has the final say on whether the write is allowed at all.
 */

type SupportMessages = AccountMessages["support"];

function errorText(state: SupportActionState, messages: SupportMessages): string | null {
  if (!state.error) {
    return null;
  }

  return messages.errors[state.error as keyof typeof messages.errors] ?? messages.errors.unknown;
}

export function NewThreadForm({
  locale,
  messages,
}: {
  locale: Locale;
  messages: SupportMessages;
}) {
  const [state, formAction, pending] = useActionState<SupportActionState, FormData>(
    openThreadAction,
    INITIAL_SUPPORT_STATE,
  );

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="locale" value={locale} />

      <FormResult
        error={errorText(state, messages)}
        notice={state.notice ? messages.opened : null}
      />

      <TextField label={messages.subjectLabel} name="subject" maxLength={200} required />

      <TextAreaField
        label={messages.bodyLabel}
        hint={messages.bodyHint}
        name="body"
        rows={5}
        maxLength={4000}
        required
      />

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? messages.sending : messages.openAction}
        </Button>
      </div>
    </form>
  );
}

export function ReplyForm({
  locale,
  threadId,
  closed,
  messages,
}: {
  locale: Locale;
  threadId: string;
  /** A closed thread keeps its box, disabled, so the reason is visible. */
  closed: boolean;
  messages: SupportMessages;
}) {
  const [state, formAction, pending] = useActionState<SupportActionState, FormData>(
    replyAction,
    INITIAL_SUPPORT_STATE,
  );

  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="threadId" value={threadId} />

      <FormResult error={errorText(state, messages)} />

      <TextAreaField
        label={messages.replyLabel}
        name="body"
        rows={3}
        maxLength={4000}
        required
        disabled={closed}
        placeholder={closed ? messages.closedNotice : undefined}
      />

      <div>
        <Button type="submit" disabled={pending || closed}>
          {pending ? messages.sending : messages.replyAction}
        </Button>
      </div>
    </form>
  );
}
