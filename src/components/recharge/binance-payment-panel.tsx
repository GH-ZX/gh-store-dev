"use client";

import { useActionState, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertIcon, CheckIcon, WalletIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";
import { formatMessage, type RechargeMessages } from "@/i18n/messages";
import { formatPrice } from "@/lib/format/money";
import {
  INITIAL_BINANCE_STATE,
  type BinanceTopUpState,
} from "@/app/[locale]/recharge/action-state";
import { checkBinanceInvoiceAction } from "@/app/[locale]/recharge/actions";
import type { BinanceInvoiceView } from "@/lib/services/binance-recharge.service";

/**
 * The payment screen for one Binance invoice.
 *
 * The same three things a customer needs as the Sam panel, in the same order:
 * what to pay and where, how long they have, and a screen that notices on its
 * own once the money is in. Before this existed the customer was sent straight
 * to Binance and their only way back was the wallet page — where a payment
 * still being confirmed looks exactly like one that failed.
 *
 * Polling asks Binance through the store (the invoice's own status is never
 * trusted on its own), so a notification that never arrives costs seconds,
 * not the top-up.
 */
export type BinancePaymentPanelProps = {
  locale: Locale;
  messages: RechargeMessages;
  invoice: BinanceInvoiceView;
};

/** Binance settles within seconds of paying; five is often enough. */
const POLL_MS = 5_000;

const CLOSED_STATUSES = new Set(["failed", "expired", "cancelled"]);

function useCountdown(expiresAt: string | null): number | null {
  const [remaining, setRemaining] = useState<number | null>(null);

  /*
   * Same rule as the Sam panel: never compare clocks during render. The first
   * tick is scheduled rather than called, so hydration renders nothing stale.
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

export function BinancePaymentPanel({ locale, messages, invoice }: BinancePaymentPanelProps) {
  const [state, action, pending] = useActionState<BinanceTopUpState, FormData>(
    checkBinanceInvoiceAction,
    INITIAL_BINANCE_STATE,
  );

  const remaining = useCountdown(invoice.expiresAt);

  // The row's own status starts; an answer from Binance supersedes it.
  const status =
    state.status ??
    (invoice.status === "credited"
      ? "credited"
      : CLOSED_STATUSES.has(invoice.status)
        ? invoice.status
        : "pending");

  const settled = status !== "pending" && status.toUpperCase() !== "PAID" && status !== "NEW";

  useEffect(() => {
    if (settled || pending) {
      return;
    }

    const timer = setInterval(() => {
      const data = new FormData();
      data.set("invoiceId", invoice.id);
      data.set("locale", locale);
      action(data);
    }, POLL_MS);

    return () => clearInterval(timer);
  }, [settled, pending, invoice.id, locale, action]);

  if (status === "credited") {
    return (
      <div className="rounded-[var(--radius-card)] border border-[color-mix(in_srgb,var(--success)_40%,transparent)] bg-[color-mix(in_srgb,var(--success)_10%,transparent)] p-6 text-center">
        <Badge tone="success" icon={<CheckIcon />}>
          {messages.binance.creditedTitle}
        </Badge>
        <p className="mt-4 text-3xl font-semibold tracking-tight text-[var(--ink)] tabular-nums" dir="ltr">
          {formatPrice(invoice.amount, invoice.currency, locale)}
        </p>
        <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">
          {messages.binance.creditedDescription}
        </p>
      </div>
    );
  }

  if (CLOSED_STATUSES.has(status)) {
    return (
      <div className="rounded-[var(--radius-card)] border border-[color-mix(in_srgb,var(--warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] p-6">
        <p className="flex items-start gap-2 text-sm leading-6 text-[var(--warning)]">
          <AlertIcon className="mt-0.5 size-4 shrink-0" />
          {messages.binance.closedDescription}
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <div className="rounded-[var(--radius-card)] border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] p-5">
        <p className="text-xs font-medium text-[var(--ink-faint)]">{messages.binance.payAmountLabel}</p>
        <p className="mt-2 text-3xl font-semibold tracking-tight text-[var(--ink)] tabular-nums" dir="ltr">
          {formatPrice(invoice.amount, invoice.currency, locale)}
        </p>

        {remaining !== null ? (
          <p className="mt-4 text-sm text-[var(--ink-muted)] tabular-nums" dir="ltr">
            {formatMessage(messages.binance.expiresIn, { time: formatRemaining(remaining) }, locale)}
          </p>
        ) : null}
      </div>

      {invoice.checkoutUrl ? (
        <a
          href={invoice.checkoutUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[var(--radius-pill)] bg-[var(--accent)] px-6 text-sm font-semibold text-[var(--accent-ink)] transition-colors duration-[var(--duration)] hover:bg-[var(--accent-strong)]"
        >
          <WalletIcon className="size-4" />
          {messages.binance.openCheckout}
        </a>
      ) : null}

      <p className="text-sm leading-6 text-[var(--ink-muted)]">{messages.binance.waitingDescription}</p>

      <form action={action} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="invoiceId" value={invoice.id} />
        <input type="hidden" name="locale" value={locale} />
        <Button type="submit" variant="secondary">
          {messages.binance.checkAction}
        </Button>
        {state.error ? (
          <span className="text-sm text-[var(--ink-muted)]">{messages.errors.unknown}</span>
        ) : null}
      </form>
    </div>
  );
}
