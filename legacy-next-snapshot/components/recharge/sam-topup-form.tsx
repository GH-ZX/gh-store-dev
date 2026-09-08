"use client";

import { useActionState, useState } from "react";
import { FormResult, SelectField, TextField } from "@/components/admin/admin-form";
import { Button } from "@/components/ui/button";
import { ArrowIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";
import { formatMessage } from "@/i18n/format";
import type { RechargeMessages } from "@/i18n/messages";
import {
  INITIAL_SAM_TOPUP_STATE,
  type SamTopUpState,
} from "@/app/[locale]/recharge/sam-action-state";
import { startSamTopUpAction } from "@/app/[locale]/recharge/sam-actions";
import type { SamMethod } from "@/lib/settings/sam-settings";

/**
 * Start an instant top-up.
 *
 * Deliberately short: an amount and a wallet. Everything else — the account to
 * send to, the exact figure in pounds, the countdown — belongs on the payment
 * screen this leads to, where the customer is actually about to transfer.
 */
export type SamTopUpFormProps = {
  locale: Locale;
  messages: RechargeMessages;
  methods: SamMethod[];
  minAmount: number;
  maxAmount: number;
  currency: string;
};

type ErrorKey = keyof RechargeMessages["sam"]["errors"];

export function SamTopUpForm({
  locale,
  messages,
  methods,
  minAmount,
  maxAmount,
  currency,
}: SamTopUpFormProps) {
  const [state, formAction, pending] = useActionState<SamTopUpState, FormData>(
    startSamTopUpAction,
    INITIAL_SAM_TOPUP_STATE,
  );

  const [method, setMethod] = useState<SamMethod>(methods[0] ?? "shamcash");

  const error = state.error
    ? (messages.sam.errors[state.error as ErrorKey] ?? messages.sam.errors.unknown)
    : null;

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="locale" value={locale} />

      <TextField
        label={formatMessage(messages.amountLabel, { currency }, locale)}
        name="amount"
        type="number"
        step="0.01"
        min={minAmount}
        max={maxAmount}
        required
        dir="ltr"
        className="tabular-nums"
        hint={formatMessage(
          messages.amountHint,
          { min: minAmount.toString(), max: maxAmount.toString() },
          locale,
        )}
      />

      {methods.length > 1 ? (
        <SelectField
          label={messages.sam.methodLabel}
          name="method"
          value={method}
          onChange={(event) => setMethod(event.target.value as SamMethod)}
          options={methods.map((option) => ({
            value: option,
            label: option === "shamcash" ? messages.sam.methodShamcash : messages.sam.methodSyriatel,
          }))}
        />
      ) : (
        <input type="hidden" name="method" value={method} />
      )}

      <FormResult error={error} />

      <div>
        <Button
          type="submit"
          disabled={pending}
          trailingIcon={<ArrowIcon direction="end" className="rtl:rotate-180" />}
        >
          {messages.sam.startAction}
        </Button>
      </div>
    </form>
  );
}
