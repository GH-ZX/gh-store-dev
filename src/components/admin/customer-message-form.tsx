"use client";

import { useActionState, useRef } from "react";
import { AdminCard, FormResult, TextAreaField, TextField } from "@/components/admin/admin-form";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";
import type { AdminMessages } from "@/i18n/messages";
import {
  INITIAL_MESSAGE_STATE,
  type MessageState,
} from "@/app/[locale]/dashboard/customers/message-action-state";
import { sendCustomerMessageAction } from "@/app/[locale]/dashboard/customers/message-actions";

type Messages = AdminMessages["customers"];

/**
 * A message to this customer, written by the owner.
 *
 * One title and one body rather than a pair per language: the note under the
 * field says the customer reads it exactly as typed whichever language they
 * browse in, which is the honest description of what happens and cheaper than
 * asking for every message twice.
 *
 * The form is cleared on success. A sent message that stays in the box invites
 * a second send of the same words, and a notification cannot be unsent.
 */
export function CustomerMessageForm({
  locale,
  messages,
  userId,
}: {
  locale: Locale;
  messages: Messages;
  userId: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, sending] = useActionState<MessageState, FormData>(
    async (previous: MessageState, formData: FormData) => {
      const next = await sendCustomerMessageAction(previous, formData);

      if (next.notice === "sent") {
        formRef.current?.reset();
      }

      return next;
    },
    INITIAL_MESSAGE_STATE,
  );

  return (
    <AdminCard title={messages.messageTitle} description={messages.messageDescription}>
      <form ref={formRef} action={action} className="grid gap-4">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="userId" value={userId} />

        <TextField
          name="title"
          label={messages.messageSubjectLabel}
          maxLength={120}
          required
          autoComplete="off"
        />

        <TextAreaField
          name="body"
          label={messages.messageBodyLabel}
          hint={messages.messageBodyHint}
          rows={4}
          maxLength={1000}
          required
        />

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="secondary" size="sm" disabled={sending}>
            {sending ? messages.messageSending : messages.messageAction}
          </Button>
        </div>
      </form>

      <div className="mt-4">
        <FormResult
          error={
            state.error
              ? (messages.messageErrors[state.error as keyof Messages["messageErrors"]] ??
                messages.messageErrors.unknown)
              : null
          }
          notice={state.notice === "sent" ? messages.messageSent : null}
        />
      </div>
    </AdminCard>
  );
}
