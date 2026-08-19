"use client";

import { useActionState, useState } from "react";
import { SecretField } from "@/components/admin/secret-field";
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
  regenerateG2BulkCallbackAction,
  saveG2BulkSettingsAction,
  verifyG2BulkKeyAction,
} from "@/app/[locale]/dashboard/providers/actions";
import { formatMessage } from "@/i18n/messages";
import type { G2BulkCallback } from "@/lib/services/admin-settings.service";
import type { G2BulkStatus } from "@/lib/settings/provider-settings";

/**
 * G2Bulk credential and pricing form.
 *
 * The key field is locked once a key is saved — the secret is represented only
 * by a masked hint and never travels back to the browser. Editing is opened by
 * the Edit button on purpose, and leaving the field blank keeps the stored key,
 * which lets an admin change the markup without handling the secret at all.
 */
export type G2BulkSettingsFormProps = {
  locale: Locale;
  messages: AdminMessages["providers"]["g2bulk"];
  status: G2BulkStatus;
  callback: G2BulkCallback;
  secrets: AdminMessages["providers"]["secrets"];
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

export function G2BulkSettingsForm({
  locale,
  messages,
  status,
  callback,
  secrets,
}: G2BulkSettingsFormProps) {
  const [saveState, saveAction, saving] = useActionState<ProviderActionState, FormData>(
    saveG2BulkSettingsAction,
    INITIAL_PROVIDER_STATE,
  );
  const [verifyState, verifyAction, verifying] = useActionState<ProviderActionState, FormData>(
    verifyG2BulkKeyAction,
    INITIAL_PROVIDER_STATE,
  );
  const [callbackState, callbackAction, generating] = useActionState<ProviderActionState, FormData>(
    regenerateG2BulkCallbackAction,
    INITIAL_PROVIDER_STATE,
  );
  const [copied, setCopied] = useState(false);

  async function copyCallback(): Promise<void> {
    try {
      await navigator.clipboard.writeText(callback.url);
      setCopied(true);
    } catch {
      // A blocked clipboard is not worth an error: the field is selectable and
      // focusing it selects the whole address.
    }
  }

  const error = resolveError(
    messages,
    saveState.error ?? verifyState.error ?? callbackState.error,
  );
  const verified = verifyState.notice === "verified" ? verifyState.account : null;

  return (
    <div className="grid gap-6">
      <form action={saveAction} className="grid gap-5">
        <input type="hidden" name="locale" value={locale} />

        <SecretField
          label={messages.apiKeyLabel}
          name="apiKey"
          placeholder={messages.apiKeyPlaceholder}
          hint={messages.apiKeyHelp}
          keepHint={messages.apiKeyKeepHelp}
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

      {/*
        * The callback. Off until a secret exists, and that is a supported state
        * rather than a broken one — without it the reconciliation sweep is what
        * settles a slow order, which is exactly how this worked before.
        */}
      <div className="grid gap-3 border-t border-[var(--line)] pt-6">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-[var(--ink)]">{messages.callbackTitle}</h3>
          <Badge tone={status.webhookConfigured ? "success" : "neutral"}>
            {status.webhookConfigured ? messages.callbackOn : messages.callbackOff}
          </Badge>
        </div>
        <p className="text-xs leading-5 text-[var(--ink-muted)]">{messages.callbackHelp}</p>

        {status.webhookConfigured && callback.url ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              readOnly
              value={callback.url}
              onFocus={(event) => event.currentTarget.select()}
              dir="ltr"
              aria-label={messages.callbackTitle}
              className="min-w-0 flex-1 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--shell)] px-3 py-2 font-mono text-xs text-[var(--ink-soft)] outline-none"
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void copyCallback()}
              leadingIcon={copied ? <CheckIcon /> : undefined}
            >
              {copied ? messages.callbackCopied : messages.callbackCopy}
            </Button>
          </div>
        ) : null}

        {/*
          * Only ever about an address the supplier could not reach. Supabase is
          * public HTTPS, so in practice this is a local stack — and a callback
          * pointed at one is silently never delivered.
          */}
        {status.webhookConfigured && callback.reachable !== "ok" ? (
          <p
            role="note"
            className="rounded-[var(--radius-control)] border border-[color-mix(in_srgb,var(--warning)_40%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] px-4 py-3 text-xs leading-5 text-[var(--ink-muted)]"
          >
            {messages.callbackUnreachable}
          </p>
        ) : null}

        <form action={callbackAction} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="locale" value={locale} />
          <Button type="submit" variant="secondary" size="sm" disabled={generating}>
            {status.webhookConfigured ? messages.callbackRegenerate : messages.callbackEnable}
          </Button>
          {status.webhookConfigured ? (
            <span className="text-xs leading-5 text-[var(--ink-faint)]">
              {messages.callbackRegenerateHelp}
            </span>
          ) : null}
          {callbackState.notice === "callback_ready" ? (
            <Badge tone="success" icon={<CheckIcon />}>
              {messages.saved}
            </Badge>
          ) : null}
        </form>
      </div>

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
