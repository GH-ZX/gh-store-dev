"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
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
 * The invoice is opened on the server and the customer is sent to this store's
 * own payment screen for it — which links on to Binance and watches the outcome
 * — rather than straight into Binance's checkout. A customer dropped directly at
 * a third-party page had nowhere to come back to but their wallet, where a
 * payment still being confirmed looks identical to one that failed.
 *
 * `window.location.assign` rather than a link, because the destination is not
 * known until the action answers.
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
  const router = useRouter();

  useEffect(() => {
    if (state.invoiceId) {
      router.push(`/${locale}/recharge/pay/${encodeURIComponent(state.invoiceId)}`);
    }
  }, [state.invoiceId, locale, router]);

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
            target="_blank"
            rel="noopener noreferrer"
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
