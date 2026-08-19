"use client";

import { useActionState } from "react";
import { FormResult, SelectField } from "@/components/admin/admin-form";
import { SecretField } from "@/components/admin/secret-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";
import type { AdminMessages } from "@/i18n/messages";
import {
  INITIAL_PROVIDER_STATE,
  type ProviderActionState,
} from "@/app/[locale]/dashboard/providers/action-state";
import { saveBinanceSettingsAction } from "@/app/[locale]/dashboard/providers/actions";
import { BINANCE_CURRENCIES, type BinanceStatus } from "@/lib/settings/binance-settings";

/**
 * Binance Pay credentials and the switch that offers it to customers.
 *
 * The switch is separate from the credentials on purpose, and it is the whole
 * reason this panel does not look like the supplier ones: saving a key here must
 * not put a new payment method in front of customers by itself. An owner enters
 * the pair, then decides.
 *
 * Both secrets are write-only. The key is represented by a masked tail once
 * saved, the secret by nothing at all — there is no version of showing it that
 * is worth the risk, and re-entering both is the recovery path.
 */
export type BinanceSettingsFormProps = {
  locale: Locale;
  messages: AdminMessages["providers"]["binance"];
  errors: AdminMessages["providers"]["g2bulk"]["errors"];
  status: BinanceStatus;
  secrets: AdminMessages["providers"]["secrets"];
};

export function BinanceSettingsForm({
  locale,
  messages,
  errors,
  status,
  secrets,
}: BinanceSettingsFormProps) {
  const [state, formAction, saving] = useActionState<ProviderActionState, FormData>(
    saveBinanceSettingsAction,
    INITIAL_PROVIDER_STATE,
  );

  const error = state.error ? (errors[state.error as keyof typeof errors] ?? errors.unknown) : null;

  return (
    <form action={formAction} className="grid gap-5">
      <input type="hidden" name="locale" value={locale} />

      <div className="grid gap-3 sm:grid-cols-2">
        <SecretField
          label={messages.apiKeyLabel}
          name="apiKey"
          lockedHint={secrets.lockedHintPair}
          editLabel={secrets.editAction}
          cancelLabel={secrets.cancelAction}
          configured={status.configured}
        />

        <SecretField
          label={messages.apiSecretLabel}
          name="apiSecret"
          lockedHint={secrets.lockedHintPair}
          editLabel={secrets.editAction}
          cancelLabel={secrets.cancelAction}
          configured={status.configured}
        />
      </div>

      <p className="text-xs leading-5 text-[var(--ink-faint)]">
        {messages.credentialsHelp}
        {status.configured ? ` ${messages.credentialsKeepHelp}` : ""}
      </p>

      <SelectField
        label={messages.currencyLabel}
        hint={messages.currencyHelp}
        name="currency"
        defaultValue={status.currency}
        fieldClassName="max-w-xs"
        options={BINANCE_CURRENCIES.map((currency) => ({ value: currency, label: currency }))}
      />

      <label className="flex items-start gap-3 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-4">
        <input
          type="checkbox"
          name="enabled"
          defaultChecked={status.enabled}
          className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]"
        />
        <span>
          <span className="block text-sm font-medium text-[var(--ink)]">{messages.enableLabel}</span>
          <span className="mt-1 block text-xs leading-5 text-[var(--ink-muted)]">
            {messages.enableHelp}
          </span>
        </span>
      </label>

      <p
        role="note"
        className="rounded-[var(--radius-control)] border border-[color-mix(in_srgb,var(--warning)_40%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] px-4 py-3 text-xs leading-5 text-[var(--ink-muted)]"
      >
        {messages.pendingWork}
      </p>

      <FormResult error={error} notice={state.notice === "saved" ? messages.saved : null} />

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={saving}>
          {messages.saveAction}
        </Button>
        {state.notice === "saved" ? (
          <Badge tone="success" icon={<CheckIcon />}>
            {messages.saved}
          </Badge>
        ) : null}
      </div>
    </form>
  );
}
