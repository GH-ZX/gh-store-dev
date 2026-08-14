"use client";

import { useActionState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";
import type { RechargeMessages } from "@/i18n/messages";
import {
  INITIAL_BINANCE_STATE,
  type BinanceTopUpState,
} from "@/app/[locale]/recharge/action-state";
import { startBinanceTopUpAction } from "@/app/[locale]/recharge/actions";

/**
 * Pay with crypto.
 *
 * The invoice is opened on the server and the customer is then sent to Binance's
 * own checkout. The hand-off happens here rather than as a server redirect so a
 * failure to create the invoice is still readable on the store's own page —
 * a redirect that never happens is indistinguishable from a slow one.
 *
 * `window.location.assign` rather than a link, because the destination is not
 * known until the action answers. Under a blocked navigation the URL is still
 * rendered as a link below, so the customer is never stranded holding an invoice
 * they cannot reach.
 */
export type BinanceTopUpFormProps = {
  locale: Locale;
  messages: RechargeMessages;
  currency: string;
  minAmount: number;
  maxAmount: number;
};

export function BinanceTopUpForm({
  locale,
  messages,
  currency,
  minAmount,
  maxAmount,
}: BinanceTopUpFormProps) {
  const [state, formAction, pending] = useActionState<BinanceTopUpState, FormData>(
    startBinanceTopUpAction,
    INITIAL_BINANCE_STATE,
  );

  useEffect(() => {
    if (state.checkoutUrl) {
      window.location.assign(state.checkoutUrl);
    }
  }, [state.checkoutUrl]);

  const error = state.error
    ? (messages.binance.errors[state.error as keyof typeof messages.binance.errors] ??
      messages.binance.errors.unknown)
    : null;

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="locale" value={locale} />

      <label className="grid max-w-xs gap-2">
        <span className="text-sm font-medium text-[var(--ink-soft)]">
          {messages.amountLabel}
        </span>
        <input
          type="number"
          name="amount"
          min={minAmount}
          max={maxAmount}
          step={0.01}
          required
          dir="ltr"
          className="min-h-12 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] px-4 text-sm text-[var(--ink)] tabular-nums outline-none transition-colors duration-[var(--duration)] focus:border-[color-mix(in_srgb,var(--accent)_55%,transparent)]"
        />
        <span className="text-xs leading-5 text-[var(--ink-faint)]">
          {messages.binance.amountHint.replace("{currency}", currency)}
        </span>
      </label>

      {error ? (
        <p
          role="alert"
          className="rounded-[var(--radius-control)] border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[var(--danger-surface)] px-4 py-3 text-sm leading-6 text-[var(--danger)]"
        >
          {error}
        </p>
      ) : null}

      {state.checkoutUrl ? (
        <p className="text-sm leading-6 text-[var(--ink-muted)]">
          {messages.binance.redirecting}{" "}
          <a
            href={state.checkoutUrl}
            className="font-semibold text-[var(--accent)] underline underline-offset-4"
          >
            {messages.binance.openCheckout}
          </a>
        </p>
      ) : null}

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? messages.binance.starting : messages.binance.payAction}
        </Button>
      </div>
    </form>
  );
}
