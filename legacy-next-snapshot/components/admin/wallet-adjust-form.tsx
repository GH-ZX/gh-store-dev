"use client";

import { useActionState, useMemo } from "react";
import { AdminCard, FormResult, TextField } from "@/components/admin/admin-form";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";
import type { AdminMessages } from "@/i18n/messages";
import {
  INITIAL_CUSTOMER_STATE,
  type CustomerActionState,
} from "@/app/[locale]/dashboard/customers/action-state";
import { adjustBalanceAction } from "@/app/[locale]/dashboard/customers/actions";

/**
 * Balance correction.
 *
 * A fresh idempotency key is generated per rendered form and submitted with it,
 * so a double-clicked button or a resubmitted page cannot credit twice — the
 * second attempt replays the first result instead of adding again.
 */
export type WalletAdjustFormProps = {
  locale: Locale;
  messages: AdminMessages["customers"];
  userId: string;
};

type ErrorKey = keyof AdminMessages["customers"]["errors"];

export function WalletAdjustForm({ locale, messages, userId }: WalletAdjustFormProps) {
  const [state, formAction, pending] = useActionState<CustomerActionState, FormData>(
    adjustBalanceAction,
    INITIAL_CUSTOMER_STATE,
  );

  // Tied to this mount, not to each submit, so a retry of the same intent stays
  // the same operation.
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);

  const error = state.error
    ? (messages.errors[state.error as ErrorKey] ?? messages.errors.unknown)
    : null;

  return (
    <AdminCard title={messages.adjustTitle} description={messages.adjustDescription}>
      <form action={formAction} className="grid gap-4">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="userId" value={userId} />
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

        <div className="grid gap-4 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
          <TextField
            label={messages.adjustAmount}
            name="amount"
            type="number"
            step="0.01"
            required
            dir="ltr"
            placeholder="0.00"
            className="tabular-nums"
          />
          <TextField label={messages.adjustNote} name="description" required minLength={3} maxLength={280} />
        </div>

        <FormResult error={error} notice={state.notice === "adjusted" ? messages.adjusted : null} />

        <div>
          <Button type="submit" disabled={pending}>
            {messages.adjustAction}
          </Button>
        </div>
      </form>
    </AdminCard>
  );
}
