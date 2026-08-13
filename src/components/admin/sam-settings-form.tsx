"use client";

import { useActionState, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertIcon, CheckIcon, ShieldIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";
import type { AdminMessages } from "@/i18n/messages";
import { formatPrice } from "@/lib/format/money";
import type { SamLinkedWallet, SamOverview } from "@/lib/services/admin-sam.service";
import type { SamStatus } from "@/lib/settings/sam-settings";
import {
  INITIAL_SAM_STATE,
  type SamActionState,
} from "@/app/[locale]/dashboard/providers/sam-action-state";
import {
  refreshSamWalletsAction,
  regenerateSamSecretAction,
  saveSamSettingsAction,
} from "@/app/[locale]/dashboard/providers/sam-actions";

/**
 * Sam API configuration.
 *
 * The wallets come first, because they are the answer to the only question an
 * owner has after pasting a key: did it work? They are read on the server every
 * time this page renders, so saving a key shows the wallet, its balance, and its
 * recent transfers straight away rather than hiding them behind a button whose
 * result vanished on the next render.
 *
 * The key field renders empty even when a key is stored — the saved secret is
 * represented by a masked tail only — so leaving it blank changes a wallet or the
 * review policy without handling the secret.
 */
export type SamSettingsFormProps = {
  locale: Locale;
  messages: AdminMessages["providers"]["sam"];
  status: SamStatus;
  overview: SamOverview;
};

type Messages = AdminMessages["providers"]["sam"];
type ErrorKey = keyof Messages["errors"];

function resolveError(messages: Messages, key: string | null): string | null {
  if (!key) {
    return null;
  }

  return messages.errors[key as ErrorKey] ?? messages.errors.unknown;
}

const fieldClass =
  "min-h-12 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] px-4 text-sm text-[var(--ink)] outline-none transition-colors duration-[var(--duration)] focus:border-[color-mix(in_srgb,var(--accent)_55%,transparent)]";

const cardClass = "rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-5";

/** A warning panel for a callback address Sam will never be able to call. */
function CallbackWarning({ title, body }: { title: string; body: string }) {
  return (
    <div
      role="note"
      className="flex items-start gap-2.5 rounded-[var(--radius-control)] border border-[color-mix(in_srgb,var(--warning)_40%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] px-4 py-3"
    >
      <AlertIcon className="mt-0.5 size-4 shrink-0 text-[var(--warning)]" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[var(--ink)]">{title}</p>
        <p className="mt-1 text-xs leading-5 text-[var(--ink-muted)]">{body}</p>
      </div>
    </div>
  );
}

export function SamSettingsForm({ locale, messages, status, overview }: SamSettingsFormProps) {
  const [saveState, saveAction, saving] = useActionState<SamActionState, FormData>(
    saveSamSettingsAction,
    INITIAL_SAM_STATE,
  );
  const [refreshState, refreshAction, refreshing] = useActionState<SamActionState, FormData>(
    refreshSamWalletsAction,
    INITIAL_SAM_STATE,
  );
  const [regenerateState, regenerateAction, regenerating] = useActionState<SamActionState, FormData>(
    regenerateSamSecretAction,
    INITIAL_SAM_STATE,
  );

  // Only relevant when invoicing in pounds, so the rate field follows the choice.
  const [currency, setCurrency] = useState(status.invoiceCurrency);

  /*
   * Controlled, so picking a wallet from the list below can fill them in. A
   * ShamCash address is 32 characters of hex — exactly the kind of value that is
   * mistyped when copied by hand, and a mistyped one fails as a customer's
   * payment rather than as a form error.
   */
  const [shamcash, setShamcash] = useState(status.shamcashIdentifier ?? "");
  const [syriatel, setSyriatel] = useState(status.syriatelIdentifier ?? "");
  const [copied, setCopied] = useState(false);

  async function copyCallback(): Promise<void> {
    try {
      await navigator.clipboard.writeText(overview.callbackUrl);
      setCopied(true);
    } catch {
      // A blocked clipboard is not worth an error: the field is selectable and
      // focusing it selects the whole address.
    }
  }

  const error = resolveError(
    messages,
    saveState.error ?? refreshState.error ?? regenerateState.error ?? overview.error,
  );
  const wallets = overview.wallets;

  // Not named `use…`: that prefix is reserved for hooks, and this is a click.
  function fillIdentifier(wallet: SamLinkedWallet): void {
    if (!wallet.identifier) {
      return;
    }

    if (wallet.provider === "shamcash") {
      setShamcash(wallet.identifier);
    } else {
      setSyriatel(wallet.identifier);
    }
  }

  return (
    <div className="grid gap-6">
      {error ? (
        <p
          role="alert"
          className="rounded-[var(--radius-control)] border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[var(--danger-surface)] px-4 py-3 text-sm leading-6 text-[var(--danger)]"
        >
          {error}
        </p>
      ) : null}

      <section className={cardClass}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-[var(--ink)]">{messages.walletsTitle}</h3>
            <p className="mt-1 text-xs leading-5 text-[var(--ink-muted)]">
              {messages.walletsDescription}
            </p>
          </div>

          {status.configured ? (
            <form action={refreshAction}>
              <input type="hidden" name="locale" value={locale} />
              <Button
                type="submit"
                variant="secondary"
                size="sm"
                disabled={refreshing}
                leadingIcon={<ShieldIcon />}
              >
                {messages.walletsRefresh}
              </Button>
            </form>
          ) : null}
        </div>

        {wallets === null ? (
          <p className="mt-4 text-sm leading-6 text-[var(--ink-muted)]">{messages.walletsNoKey}</p>
        ) : wallets.length === 0 ? (
          <p className="mt-4 flex items-start gap-2 text-sm leading-6 text-[var(--warning)]">
            <AlertIcon className="mt-0.5 size-4 shrink-0" />
            {messages.walletsEmpty}
          </p>
        ) : (
          <ul className="mt-4 grid gap-2">
            {wallets.map((wallet, index) => (
              <li
                key={`${wallet.provider}-${wallet.identifier ?? index}`}
                className="rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--shell)] px-4 py-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="neutral">
                        {wallet.provider === "shamcash"
                          ? messages.methodShamcash
                          : messages.methodSyriatel}
                      </Badge>
                      {wallet.label ? (
                        <span className="text-sm font-semibold text-[var(--ink)]">
                          {wallet.label}
                        </span>
                      ) : null}
                      {wallet.selected ? (
                        <Badge tone="success" icon={<CheckIcon />}>
                          {messages.walletSelected}
                        </Badge>
                      ) : null}
                    </div>

                    {/* The value the identifier field below needs. */}
                    <p className="mt-1.5 truncate font-mono text-xs text-[var(--ink-muted)]" dir="ltr">
                      {wallet.identifier ?? "—"}
                    </p>
                  </div>

                  <div className="text-end">
                    <p className="text-[0.6875rem] text-[var(--ink-faint)]">
                      {messages.balanceLabel}
                    </p>
                    <div className="mt-0.5 grid gap-0.5" dir="ltr">
                      {wallet.balances.length === 0 ? (
                        <span className="text-sm text-[var(--ink-muted)]">—</span>
                      ) : (
                        wallet.balances.map((balance) => (
                          <span
                            key={balance.currency}
                            className="text-sm font-semibold text-[var(--ink)] tabular-nums"
                          >
                            {formatPrice(balance.amount, balance.currency, locale)}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {wallet.identifier && !wallet.selected ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-2"
                    onClick={() => fillIdentifier(wallet)}
                  >
                    {messages.walletUse}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {wallets !== null && wallets.length > 0 ? (
        <section className={cardClass}>
          <h3 className="text-sm font-semibold text-[var(--ink)]">{messages.historyTitle}</h3>
          <p className="mt-1 text-xs leading-5 text-[var(--ink-muted)]">
            {messages.historyDescription}
          </p>

          {overview.transactions.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--ink-muted)]">{messages.historyEmpty}</p>
          ) : (
            <ul className="mt-4 grid gap-2">
              {overview.transactions.map((transaction) => (
                <li
                  key={transaction.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--shell)] px-4 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={transaction.direction === "in" ? "success" : "neutral"}>
                        {transaction.direction === "in" ? messages.historyIn : messages.historyOut}
                      </Badge>
                      {transaction.counterparty ? (
                        <span className="truncate text-sm text-[var(--ink)]">
                          {transaction.counterparty}
                        </span>
                      ) : null}
                    </div>
                    {transaction.occurredAt ? (
                      <p
                        className="mt-1 text-xs text-[var(--ink-faint)] tabular-nums"
                        dir="ltr"
                      >
                        {transaction.occurredAt.slice(0, 16).replace("T", " ")}
                      </p>
                    ) : null}
                  </div>

                  <span
                    className="text-sm font-semibold text-[var(--ink)] tabular-nums"
                    dir="ltr"
                  >
                    {transaction.amount === null
                      ? "—"
                      : formatPrice(transaction.amount, transaction.currency ?? "USD", locale)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

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
              value={shamcash}
              onChange={(event) => setShamcash(event.target.value)}
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
              value={syriatel}
              onChange={(event) => setSyriatel(event.target.value)}
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

      {/*
        * Its own section, not a field on the form above. Replacing the secret
        * breaks every invoice already waiting for payment, so it is a button
        * pressed on purpose rather than a checkbox carried along by a save.
        */}
      <section className={cardClass}>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-[var(--ink)]">{messages.webhookTitle}</h3>
          {status.webhookConfigured ? (
            <Badge tone="success" icon={<CheckIcon />}>
              {messages.webhookReady}
            </Badge>
          ) : (
            <Badge tone="warning">{messages.webhookMissing}</Badge>
          )}
        </div>

        <p className="mt-2 text-xs leading-5 text-[var(--ink-muted)]">
          {messages.webhookDescription}
        </p>

        {/*
          * The whole address, secret and all. Sam authenticates itself with
          * nothing else, so a version with the token stripped is not the
          * address — an owner checking it would be reading a different string
          * from the one Sam is given. Read-only, and only ever rendered for a
          * signed-in administrator.
          */}
        <div className="mt-3 flex gap-2">
          <input
            type="text"
            readOnly
            value={overview.callbackUrl}
            onFocus={(event) => event.currentTarget.select()}
            dir="ltr"
            className="min-w-0 flex-1 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--shell)] px-3 py-2 font-mono text-xs text-[var(--ink-soft)] outline-none"
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void copyCallback()}
            leadingIcon={copied ? <CheckIcon /> : undefined}
          >
            {copied ? messages.webhookCopied : messages.webhookCopy}
          </Button>
        </div>

        {overview.callbackReachability === "local" ? (
          <div className="mt-3">
            <CallbackWarning title={messages.webhookLocalTitle} body={messages.webhookLocalBody} />
          </div>
        ) : null}

        {overview.callbackReachability === "insecure" ||
        overview.callbackReachability === "invalid" ? (
          <div className="mt-3">
            <CallbackWarning
              title={messages.webhookInsecureTitle}
              body={messages.webhookInsecureBody}
            />
          </div>
        ) : null}

        {status.webhookConfigured ? (
          <form action={regenerateAction} className="mt-4 border-t border-[var(--line)] pt-4">
            <input type="hidden" name="locale" value={locale} />
            <Button type="submit" variant="secondary" size="sm" disabled={regenerating}>
              {messages.webhookRegenerate}
            </Button>
            <p className="mt-2 text-xs leading-5 text-[var(--ink-muted)]">
              {messages.webhookRegenerateHelp}
            </p>
            {regenerateState.notice === "secret_regenerated" ? (
              <p className="mt-2 text-xs font-semibold text-[var(--success)]">
                {messages.webhookRegenerated}
              </p>
            ) : null}
          </form>
        ) : null}
      </section>
    </div>
  );
}
