"use client";

import { useActionState, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertIcon, CheckIcon, ShieldIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";
import type { AdminMessages } from "@/i18n/messages";
import type { SamStatus } from "@/lib/settings/sam-settings";
import {
  INITIAL_SAM_STATE,
  type SamActionState,
} from "@/app/[locale]/dashboard/providers/sam-action-state";
import {
  saveSamSettingsAction,
  testSamWalletsAction,
} from "@/app/[locale]/dashboard/providers/sam-actions";

/**
 * Sam API configuration.
 *
 * The order of the fields follows the order an owner has to do things in: put the
 * key in, list the wallets to find out what the identifiers are, paste the right
 * one in, then decide whether confirmed payments credit on their own.
 *
 * The key field renders empty even when a key is stored — the saved secret is
 * represented by a masked tail only — so leaving it blank changes a wallet or the
 * review policy without handling the secret.
 */
export type SamSettingsFormProps = {
  locale: Locale;
  messages: AdminMessages["providers"]["sam"];
  status: SamStatus;
};

type ErrorKey = keyof AdminMessages["providers"]["sam"]["errors"];

function resolveError(messages: AdminMessages["providers"]["sam"], key: string | null): string | null {
  if (!key) {
    return null;
  }

  return messages.errors[key as ErrorKey] ?? messages.errors.unknown;
}

const fieldClass =
  "min-h-12 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] px-4 text-sm text-[var(--ink)] outline-none transition-colors duration-[var(--duration)] focus:border-[color-mix(in_srgb,var(--accent)_55%,transparent)]";

export function SamSettingsForm({ locale, messages, status }: SamSettingsFormProps) {
  const [saveState, saveAction, saving] = useActionState<SamActionState, FormData>(
    saveSamSettingsAction,
    INITIAL_SAM_STATE,
  );
  const [walletState, walletAction, testing] = useActionState<SamActionState, FormData>(
    testSamWalletsAction,
    INITIAL_SAM_STATE,
  );

  // Only relevant when invoicing in pounds, so the rate field follows the choice.
  const [currency, setCurrency] = useState(status.invoiceCurrency);

  const error = resolveError(messages, saveState.error ?? walletState.error);
  const wallets = walletState.wallets ?? [];

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
            className={`${fieldClass} font-mono`}
          />
          <span className="text-xs leading-5 text-[var(--ink-faint)]">
            {messages.apiKeyHelp}
            {status.configured ? ` ${messages.apiKeyKeepHelp}` : ""}
          </span>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2">
            <span className="text-sm font-medium text-[var(--ink-soft)]">{messages.shamcashLabel}</span>
            <input
              type="text"
              name="shamcashIdentifier"
              defaultValue={status.shamcashIdentifier ?? ""}
              autoComplete="off"
              spellCheck={false}
              dir="ltr"
              placeholder={messages.shamcashPlaceholder}
              className={`${fieldClass} font-mono`}
            />
            <span className="text-xs leading-5 text-[var(--ink-faint)]">{messages.shamcashHelp}</span>
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium text-[var(--ink-soft)]">{messages.syriatelLabel}</span>
            <input
              type="text"
              name="syriatelIdentifier"
              defaultValue={status.syriatelIdentifier ?? ""}
              autoComplete="off"
              spellCheck={false}
              dir="ltr"
              placeholder={messages.syriatelPlaceholder}
              className={`${fieldClass} font-mono`}
            />
            <span className="text-xs leading-5 text-[var(--ink-faint)]">{messages.syriatelHelp}</span>
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2">
            <span className="text-sm font-medium text-[var(--ink-soft)]">{messages.currencyLabel}</span>
            <select
              name="invoiceCurrency"
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
              dir="ltr"
              className={fieldClass}
            >
              <option value="USD">{messages.currencyUsd}</option>
              <option value="SYP">{messages.currencySyp}</option>
            </select>
            <span className="text-xs leading-5 text-[var(--ink-faint)]">{messages.currencyHelp}</span>
          </label>

          {currency === "SYP" ? (
            <label className="grid gap-2">
              <span className="text-sm font-medium text-[var(--ink-soft)]">{messages.rateLabel}</span>
              <input
                type="number"
                name="sypPerUsd"
                min={0}
                step={1}
                defaultValue={status.sypPerUsd || ""}
                dir="ltr"
                className={`${fieldClass} tabular-nums`}
              />
              <span className="text-xs leading-5 text-[var(--ink-faint)]">{messages.rateHelp}</span>
            </label>
          ) : null}
        </div>

        <div className="grid gap-3 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] p-4">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={status.enabled}
              className="mt-0.5 size-4 accent-[var(--accent)]"
            />
            <span>
              <span className="block text-sm font-medium text-[var(--ink)]">{messages.enabledLabel}</span>
              <span className="mt-1 block text-xs leading-5 text-[var(--ink-muted)]">
                {messages.enabledHelp}
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 border-t border-[var(--line)] pt-3">
            <input
              type="checkbox"
              name="manualReview"
              defaultChecked={status.manualReview}
              className="mt-0.5 size-4 accent-[var(--accent)]"
            />
            <span>
              <span className="block text-sm font-medium text-[var(--ink)]">
                {messages.manualReviewLabel}
              </span>
              <span className="mt-1 block text-xs leading-5 text-[var(--ink-muted)]">
                {messages.manualReviewHelp}
              </span>
            </span>
          </label>
        </div>

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
        action={walletAction}
        className="grid gap-4 border-t border-[var(--line)] pt-6"
      >
        <input type="hidden" name="locale" value={locale} />

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            variant="secondary"
            disabled={testing || !status.configured}
            leadingIcon={<ShieldIcon />}
          >
            {messages.testAction}
          </Button>
          <span className="text-xs leading-5 text-[var(--ink-faint)]">{messages.testHelp}</span>
        </div>

        {walletState.notice === "wallets_loaded" ? (
          wallets.length === 0 ? (
            <p className="flex items-start gap-2 text-sm text-[var(--warning)]">
              <AlertIcon className="mt-0.5 size-4 shrink-0" />
              {messages.walletsEmpty}
            </p>
          ) : (
            <ul className="grid gap-2">
              {wallets.map((wallet, index) => (
                <li
                  key={`${wallet.provider}-${wallet.identifier ?? index}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="neutral">
                        {wallet.provider === "shamcash" ? messages.methodShamcash : messages.methodSyriatel}
                      </Badge>
                      {wallet.label ? (
                        <span className="text-sm text-[var(--ink)]">{wallet.label}</span>
                      ) : null}
                    </div>
                    {/* The value to paste into the field above. */}
                    <p className="mt-1.5 truncate font-mono text-xs text-[var(--ink-muted)]" dir="ltr">
                      {wallet.identifier ?? "—"}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs text-[var(--ink-muted)] tabular-nums" dir="ltr">
                    {wallet.balances.length === 0 ? (
                      <span>—</span>
                    ) : (
                      wallet.balances.map((balance) => (
                        <span key={balance.currency}>
                          {balance.amount} {balance.currency}
                        </span>
                      ))
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )
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
