"use client";

import { useActionState } from "react";
import { SecretField } from "@/components/admin/secret-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckIcon, ShieldIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";
import { formatMessage, type AdminMessages } from "@/i18n/messages";
import {
  INITIAL_PROVIDER_STATE,
  type ProviderActionState,
} from "@/app/[locale]/dashboard/providers/action-state";
import {
  saveBatStoreSettingsAction,
  verifyBatStoreTokenAction,
} from "@/app/[locale]/dashboard/providers/actions";
import type { BatStoreStatus } from "@/lib/settings/batstore-settings";

/**
 * BatStore credentials.
 *
 * Built to read like the MaxStore panel beside it — same masked-hint rule, same
 * verify button — because an owner running several suppliers should be learning
 * one screen, not several. The token field is locked once a token is saved;
 * editing is opened by the Edit button on purpose, and leaving the field blank
 * keeps the saved secret.
 *
 * The verify button is both a convenience and the first proof that
 * `docs/providers/batstore-api.md` matches the real API: `/me` returns the
 * wallet balance, the number an owner wants to see next to a saved key.
 */
export type BatStoreSettingsFormProps = {
  locale: Locale;
  messages: AdminMessages["providers"]["batstore"];
  errors: AdminMessages["providers"]["g2bulk"]["errors"];
  status: BatStoreStatus;
  secrets: AdminMessages["providers"]["secrets"];
};

export function BatStoreSettingsForm({
  locale,
  messages,
  errors,
  status,
  secrets,
}: BatStoreSettingsFormProps) {
  const [saveState, saveAction, saving] = useActionState<ProviderActionState, FormData>(
    saveBatStoreSettingsAction,
    INITIAL_PROVIDER_STATE,
  );
  const [verifyState, verifyAction, verifying] = useActionState<ProviderActionState, FormData>(
    verifyBatStoreTokenAction,
    INITIAL_PROVIDER_STATE,
  );

  const errorKey = saveState.error ?? verifyState.error;
  const error = errorKey ? (errors[errorKey as keyof typeof errors] ?? errors.unknown) : null;
  const verified = verifyState.notice === "verified" ? verifyState.account : null;

  return (
    <div className="grid gap-6">
      <form action={saveAction} className="grid gap-5">
        <input type="hidden" name="locale" value={locale} />

        <SecretField
          label={messages.apiTokenLabel}
          name="apiToken"
          placeholder={messages.apiTokenPlaceholder}
          hint={messages.apiTokenHelp}
          keepHint={messages.apiTokenKeepHelp}
          lockedHint={secrets.lockedHint}
          editLabel={secrets.editAction}
          cancelLabel={secrets.cancelAction}
          configured={status.configured}
        />

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

      <form
        action={verifyAction}
        className="flex flex-wrap items-center gap-3 border-t border-[var(--line)] pt-6"
      >
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
                {formatMessage("{balance}", { balance: verified.balance.toFixed(2) }, locale)}
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