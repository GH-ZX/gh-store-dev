"use client";

import { useActionState } from "react";
import { FormResult } from "@/components/admin/admin-form";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";
import type { AdminMessages } from "@/i18n/messages";
import {
  INITIAL_PROVIDER_STATE,
  type ProviderActionState,
} from "@/app/[locale]/dashboard/providers/action-state";
import { saveFulfillmentSettingsAction } from "@/app/[locale]/dashboard/providers/actions";

export type FulfillmentPolicyFormProps = {
  locale: Locale;
  refundOnFailure: boolean;
  messages: AdminMessages["providers"]["fulfillmentPolicy"];
  errors: AdminMessages["providers"]["g2bulk"]["errors"];
};

export function FulfillmentPolicyForm({
  locale,
  refundOnFailure,
  messages,
  errors,
}: FulfillmentPolicyFormProps) {
  const [state, formAction, pending] = useActionState<ProviderActionState, FormData>(
    saveFulfillmentSettingsAction,
    INITIAL_PROVIDER_STATE,
  );
  const error = state.error
    ? errors[state.error as keyof typeof errors] ?? errors.unknown
    : null;

  return (
    <form action={formAction} className="grid gap-5">
      <input type="hidden" name="locale" value={locale} />

      <fieldset className="grid gap-3">
        <legend className="sr-only">{messages.choiceLabel}</legend>
        <label className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-4 has-[:checked]:border-[color-mix(in_srgb,var(--accent)_55%,transparent)] has-[:checked]:bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]">
          <input
            type="radio"
            name="refundPolicy"
            value="refund"
            defaultChecked={refundOnFailure}
            className="mt-1 size-4 shrink-0 accent-[var(--accent)]"
          />
          <span>
            <span className="block text-sm font-semibold text-[var(--ink)]">{messages.refundTitle}</span>
            <span className="mt-1 block text-xs leading-5 text-[var(--ink-muted)]">
              {messages.refundDescription}
            </span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-4 has-[:checked]:border-[color-mix(in_srgb,var(--warning)_55%,transparent)] has-[:checked]:bg-[color-mix(in_srgb,var(--warning)_8%,transparent)]">
          <input
            type="radio"
            name="refundPolicy"
            value="keep"
            defaultChecked={!refundOnFailure}
            className="mt-1 size-4 shrink-0 accent-[var(--warning)]"
          />
          <span>
            <span className="block text-sm font-semibold text-[var(--ink)]">{messages.keepTitle}</span>
            <span className="mt-1 block text-xs leading-5 text-[var(--ink-muted)]">
              {messages.keepDescription}
            </span>
          </span>
        </label>
      </fieldset>

      <FormResult
        error={error}
        notice={state.notice === "saved" ? messages.saved : null}
      />

      <div>
        <Button type="submit" disabled={pending}>
          {messages.saveAction}
        </Button>
      </div>
    </form>
  );
}
