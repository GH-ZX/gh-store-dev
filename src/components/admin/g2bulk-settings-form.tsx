"use client";

import { useActionState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckIcon, ShieldIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";
import type { AdminMessages } from "@/i18n/messages";
import {
  INITIAL_PROVIDER_STATE,
  type ProviderActionState,
} from "@/app/[locale]/dashboard/providers/action-state";
import {
  saveG2BulkSettingsAction,
  verifyG2BulkKeyAction,
} from "@/app/[locale]/dashboard/providers/actions";
import { formatMessage } from "@/i18n/messages";
import type { G2BulkStatus } from "@/lib/settings/provider-settings";

/**
 * G2Bulk credential and pricing form.
 *
 * The key field is always empty on render — the saved secret is represented only
 * by a masked hint, so it never travels back to the browser. Leaving the field
 * blank keeps the stored key, which lets an admin change the markup without
 * handling the secret at all.
 */
export type G2BulkSettingsFormProps = {
  locale: Locale;
  messages: AdminMessages["providers"]["g2bulk"];
  status: G2BulkStatus;
};

type ErrorKey = keyof AdminMessages["providers"]["g2bulk"]["errors"];

function resolveError(
  messages: AdminMessages["providers"]["g2bulk"],
  key: string | null,
): string | null {
  if (!key) {
    return null;
  }

  return messages.errors[key as ErrorKey] ?? messages.errors.unknown;
}

export function G2BulkSettingsForm({ locale, messages, status }: G2BulkSettingsFormProps) {
  const [saveState, saveAction, saving] = useActionState<ProviderActionState, FormData>(
    saveG2BulkSettingsAction,
    INITIAL_PROVIDER_STATE,
  );
  const [verifyState, verifyAction, verifying] = useActionState<ProviderActionState, FormData>(
    verifyG2BulkKeyAction,
    INITIAL_PROVIDER_STATE,
  );

  const error = resolveError(messages, saveState.error ?? verifyState.error);
  const verified = verifyState.notice === "verified" ? verifyState.account : null;

  return (
    <div className="grid gap-6">
      <form action={saveAction} className="grid gap-5">
        <input type="hidden" name="locale" value={locale} />

        <label className="grid gap-2">
          <span className="text-sm font-medium text-[var(--ink-soft)]">{messages.apiKeyLabel}</span>
          <input
            type="password"
            name="apiKey"
            autoComplete="off"
            spellCheck={false}
            dir="ltr"
            placeholder={messages.apiKeyPlaceholder}
            className="min-h-12 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] px-4 font-mono text-sm text-[var(--ink)] outline-none transition-colors duration-[var(--duration)] focus:border-[color-mix(in_srgb,var(--accent)_55%,transparent)]"
          />
          <span className="text-xs leading-5 text-[var(--ink-faint)]">
            {messages.apiKeyHelp}
            {status.configured ? ` ${messages.apiKeyKeepHelp}` : ""}
          </span>
        </label>

        <label className="grid max-w-xs gap-2">
          <span className="text-sm font-medium text-[var(--ink-soft)]">{messages.markupLabel}</span>
          <input
            type="number"
            name="markupPercent"
            min={0}
            max={500}
            step={0.5}
            defaultValue={status.markupPercent}
            required
            dir="ltr"
            className="min-h-12 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] px-4 text-sm text-[var(--ink)] tabular-nums outline-none transition-colors duration-[var(--duration)] focus:border-[color-mix(in_srgb,var(--accent)_55%,transparent)]"
          />
          <span className="text-xs leading-5 text-[var(--ink-faint)]">{messages.markupHelp}</span>
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={saving}>
            {messages.saveAction}
          </Button>
          {saveState.notice === "saved" ? (
            <Badge tone="success" icon={<CheckIcon />}>
              {messages.saved}
            </Badge>
          ) : null}
        </div>
      </form>

      <form action={verifyAction} className="flex flex-wrap items-center gap-3 border-t border-[var(--line)] pt-6">
        <input type="hidden" name="locale" value={locale} />
        <Button
          type="submit"
          variant="secondary"
          disabled={verifying || !status.configured}
          leadingIcon={<ShieldIcon />}
        >
          {messages.testAction}
        </Button>

        {verified ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone="success" icon={<CheckIcon />}>
              {messages.verified}
            </Badge>
            <span className="text-[var(--ink-muted)]">
              {messages.accountLabel}: <span dir="ltr">{verified.username}</span>
            </span>
            <span className="text-[var(--ink)] tabular-nums">
              {messages.balanceLabel}:{" "}
              <span dir="ltr">
                {formatMessage("{balance} USD", { balance: verified.balance.toFixed(2) }, locale)}
              </span>
            </span>
          </div>
        ) : null}
      </form>

      {error ? (
        <p
          role="alert"
          className="rounded-[var(--radius-control)] border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[var(--danger-surface)] px-4 py-3 text-sm leading-6 text-[var(--danger)]"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
