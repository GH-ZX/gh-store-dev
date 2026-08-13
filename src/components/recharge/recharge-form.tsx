"use client";

import { useActionState, useState } from "react";
import { FormResult, SelectField, TextField } from "@/components/admin/admin-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckIcon, InfoIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";
import { formatMessage, type RechargeMessages } from "@/i18n/messages";
import {
  INITIAL_RECHARGE_STATE,
  type RechargeActionState,
} from "@/app/[locale]/recharge/action-state";
import { submitRechargeAction } from "@/app/[locale]/recharge/actions";
import {
  getMethodInstructions,
  getMethodLabel,
  type RechargeConfig,
} from "@/lib/settings/recharge-settings";

/**
 * Create a recharge request.
 *
 * Choosing a method reveals how to pay with it, so the instructions and the
 * account number are in front of the customer before they send money. After
 * submitting, the reference is shown prominently — it is how their transfer gets
 * matched to their account.
 */
export type RechargeFormProps = {
  locale: Locale;
  messages: RechargeMessages;
  config: RechargeConfig;
};

type ErrorKey = keyof RechargeMessages["errors"];

export function RechargeForm({ locale, messages, config }: RechargeFormProps) {
  const [state, formAction, pending] = useActionState<RechargeActionState, FormData>(
    submitRechargeAction,
    INITIAL_RECHARGE_STATE,
  );

  const enabled = config.methods.filter((method) => method.enabled);
  const [selected, setSelected] = useState(enabled[0]?.id ?? "");
  const method = enabled.find((candidate) => candidate.id === selected) ?? enabled[0];

  const error = state.error
    ? (messages.errors[state.error as ErrorKey] ?? messages.errors.unknown)
    : null;

  if (state.reference) {
    return (
      <div className="grid gap-4">
        <FormResult
          notice={state.credited ? messages.markedPaid : messages.referenceHint}
        />

        <div className="rounded-[var(--radius-card)] border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] p-5">
          <p className="text-xs font-medium text-[var(--ink-faint)]">{messages.referenceLabel}</p>
          <p
            className="mt-2 font-mono text-2xl font-semibold tracking-tight text-[var(--ink)]"
            dir="ltr"
          >
            {state.reference}
          </p>
          {state.credited ? (
            <Badge tone="success" icon={<CheckIcon />} className="mt-3">
              {messages.statuses.approved}
            </Badge>
          ) : (
            <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">
              {messages.referenceHint}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="grid gap-5">
      <input type="hidden" name="locale" value={locale} />

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label={messages.amountLabel}
          hint={formatMessage(
            messages.amountHint,
            { min: config.minAmount, max: config.maxAmount },
            locale,
          )}
          name="amount"
          type="number"
          step="0.01"
          min={config.minAmount}
          max={config.maxAmount}
          required
          dir="ltr"
          className="tabular-nums"
        />

        <SelectField
          label={messages.methodLabel}
          name="method"
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
          required
          options={enabled.map((candidate) => ({
            value: candidate.id,
            label: getMethodLabel(candidate, locale),
          }))}
        />
      </div>

      {method ? (
        <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
            <InfoIcon className="size-4 text-[var(--accent)]" />
            {messages.instructionsTitle}
          </p>
          {method.account ? (
            <p className="mt-3 font-mono text-sm text-[var(--ink)]" dir="ltr">
              {method.account}
            </p>
          ) : null}
          {getMethodInstructions(method, locale) ? (
            <p className="mt-2 text-sm leading-6 text-[var(--ink-muted)]">
              {getMethodInstructions(method, locale)}
            </p>
          ) : null}
        </div>
      ) : null}

      <FormResult error={error} />

      <div>
        <Button type="submit" size="lg" disabled={pending || enabled.length === 0}>
          {pending ? messages.submitting : messages.submitAction}
        </Button>
      </div>
    </form>
  );
}
