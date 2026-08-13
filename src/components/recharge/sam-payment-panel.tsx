"use client";

import { useActionState, useEffect, useState } from "react";
import { FormResult, TextField } from "@/components/admin/admin-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertIcon, CheckIcon, WalletIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";
import { formatMessage, type RechargeMessages } from "@/i18n/messages";
import { formatPrice } from "@/lib/format/money";
import {
  INITIAL_SAM_TOPUP_STATE,
  type SamTopUpState,
} from "@/app/[locale]/recharge/sam-action-state";
import {
  checkSamInvoiceAction,
  verifySamPaymentAction,
} from "@/app/[locale]/recharge/sam-actions";
import type { SamInvoiceView } from "@/lib/services/sam-recharge.service";

/**
 * The payment screen for one Sam invoice.
 *
 * Three things a customer needs, in the order they need them: what to pay and
 * where, how long they have, and a way to say "I have paid" if the money has not
 * been noticed on its own.
 *
 * The check runs on a timer as well as on the button, because Sam usually reports
 * the payment by itself within a few seconds and making someone click to discover
 * that is needless. The timer stops the moment the invoice reaches a final state,
 * so a finished screen is not quietly polling in the background.
 */
export type SamPaymentPanelProps = {
  locale: Locale;
  messages: RechargeMessages;
  invoice: SamInvoiceView;
};

type ErrorKey = keyof RechargeMessages["sam"]["errors"];

/** Sam reports payments within seconds; four is often enough and rarely wasteful. */
const POLL_MS = 4_000;

function useCountdown(expiresAt: string | null): number | null {
  const [remaining, setRemaining] = useState<number | null>(null);

  /*
   * The remaining time starts as null and is only ever set from a timer, never
   * synchronously: computing it during render or in the effect body would compare
   * a server clock with a browser clock and hydrate mismatched text. The first
   * tick is scheduled rather than called, so nothing renders a stale second.
   */
  useEffect(() => {
    if (!expiresAt) {
      return;
    }

    const deadline = new Date(expiresAt).getTime();

    if (!Number.isFinite(deadline)) {
      return;
    }

    const tick = () => setRemaining(Math.max(0, Math.floor((deadline - Date.now()) / 1000)));
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 1_000);

    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [expiresAt]);

  return remaining;
}

function formatRemaining(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;

  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

export function SamPaymentPanel({ locale, messages, invoice }: SamPaymentPanelProps) {
  const [checkState, checkAction] = useActionState<SamTopUpState, FormData>(
    checkSamInvoiceAction,
    INITIAL_SAM_TOPUP_STATE,
  );
  const [verifyState, verifyAction, verifying] = useActionState<SamTopUpState, FormData>(
    verifySamPaymentAction,
    INITIAL_SAM_TOPUP_STATE,
  );

  const remaining = useCountdown(invoice.expiresAt);

  /*
   * The row's own status is the starting truth; an action result supersedes it.
   * Reading them in this order means a screen loaded after the payment landed
   * shows the outcome immediately rather than one poll later.
   */
  const status =
    verifyState.status !== "idle"
      ? verifyState.status
      : checkState.status !== "idle"
        ? checkState.status
        : invoice.status === "credited"
          ? "credited"
          : invoice.status === "awaiting_review"
            ? "awaiting_review"
            : invoice.status === "expired" || invoice.status === "failed" || invoice.status === "cancelled"
              ? "expired"
              : "pending";

  const settled = status === "credited" || status === "awaiting_review" || status === "expired";

  // Poll while it can still change, using a form submission so the server action
  // and the button share one code path.
  useEffect(() => {
    if (settled) {
      return;
    }

    const timer = setInterval(() => {
      const data = new FormData();
      data.set("samInvoiceId", invoice.samInvoiceId);
      data.set("locale", locale);
      checkAction(data);
    }, POLL_MS);

    return () => clearInterval(timer);
  }, [settled, invoice.samInvoiceId, locale, checkAction]);

  const error =
    verifyState.error ?? checkState.error
      ? (messages.sam.errors[(verifyState.error ?? checkState.error) as ErrorKey] ??
        messages.sam.errors.unknown)
      : null;

  if (status === "credited") {
    return (
      <div className="grid gap-4">
        <div className="rounded-[var(--radius-card)] border border-[color-mix(in_srgb,var(--success)_40%,transparent)] bg-[color-mix(in_srgb,var(--success)_10%,transparent)] p-6 text-center">
          <Badge tone="success" icon={<CheckIcon />}>
            {messages.sam.creditedTitle}
          </Badge>
          <p className="mt-4 text-3xl font-semibold tracking-tight text-[var(--ink)] tabular-nums" dir="ltr">
            {formatPrice(invoice.amount, invoice.currency, locale)}
          </p>
          <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">
            {messages.sam.creditedDescription}
          </p>
        </div>
      </div>
    );
  }

  if (status === "awaiting_review") {
    return (
      <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-6">
        <Badge tone="warning">{messages.sam.reviewTitle}</Badge>
        <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">
          {messages.sam.reviewDescription}
        </p>
        {invoice.reference ? (
          <p className="mt-3 font-mono text-xs text-[var(--ink-muted)]" dir="ltr">
            {invoice.reference}
          </p>
        ) : null}
      </div>
    );
  }

  if (status === "expired") {
    return (
      <div className="rounded-[var(--radius-card)] border border-[color-mix(in_srgb,var(--warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] p-6">
        <p className="flex items-start gap-2 text-sm leading-6 text-[var(--warning)]">
          <AlertIcon className="mt-0.5 size-4 shrink-0" />
          {messages.sam.expiredDescription}
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <div className="rounded-[var(--radius-card)] border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] p-5">
        <p className="text-xs font-medium text-[var(--ink-faint)]">{messages.sam.payAmountLabel}</p>
        <p
          className="mt-2 text-3xl font-semibold tracking-tight text-[var(--ink)] tabular-nums"
          dir="ltr"
        >
          {invoice.chargeAmount !== null && invoice.chargeCurrency
            ? formatPrice(invoice.chargeAmount, invoice.chargeCurrency, locale)
            : formatPrice(invoice.amount, invoice.currency, locale)}
        </p>

        {/* When billing in pounds, say what the wallet actually receives. */}
        {invoice.chargeCurrency && invoice.chargeCurrency !== invoice.currency ? (
          <p className="mt-2 text-sm text-[var(--ink-soft)]">
            {formatMessage(
              messages.sam.creditsAs,
              { amount: formatPrice(invoice.amount, invoice.currency, locale) },
              locale,
            )}
          </p>
        ) : null}

        {remaining !== null ? (
          <p className="mt-4 text-sm text-[var(--ink-muted)] tabular-nums" dir="ltr">
            {formatMessage(messages.sam.expiresIn, { time: formatRemaining(remaining) }, locale)}
          </p>
        ) : null}
      </div>

      {invoice.paymentUrl ? (
        <a
          href={invoice.paymentUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[var(--radius-pill)] bg-[var(--accent)] px-6 text-sm font-semibold text-[var(--accent-ink)] transition-colors duration-[var(--duration)] hover:bg-[var(--accent-strong)]"
        >
          <WalletIcon className="size-4" />
          {messages.sam.openPaymentAction}
        </a>
      ) : null}

      <p className="text-sm leading-6 text-[var(--ink-muted)]">{messages.sam.waitingDescription}</p>

      <form action={checkAction} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="samInvoiceId" value={invoice.samInvoiceId} />
        <input type="hidden" name="locale" value={locale} />
        <Button type="submit" variant="secondary">
          {messages.sam.checkAction}
        </Button>
        {checkState.notice === "still_pending" ? (
          <span className="text-sm text-[var(--ink-muted)]">{messages.sam.stillPending}</span>
        ) : null}
      </form>

      <form action={verifyAction} className="grid gap-3 border-t border-[var(--line)] pt-5">
        <input type="hidden" name="samInvoiceId" value={invoice.samInvoiceId} />
        <input type="hidden" name="locale" value={locale} />

        <TextField
          label={messages.sam.referenceLabel}
          name="transactionRef"
          dir="ltr"
          autoComplete="off"
          spellCheck={false}
          className="font-mono"
          hint={messages.sam.referenceHint}
        />

        {/* The provider's own words on why a reference did not match. */}
        <FormResult error={error} notice={verifyState.detail} />

        <div>
          <Button type="submit" variant="secondary" disabled={verifying}>
            {messages.sam.verifyAction}
          </Button>
        </div>
      </form>
    </div>
  );
}
