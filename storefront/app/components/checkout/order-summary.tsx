import { StoreImage } from "@/components/store/store-image";
import type { ReactNode } from "react";
import { NoticePanel } from "@/components/shared/states";
import { ButtonLink } from "@/components/ui/button";
import { AlertIcon, BoltIcon, ShieldIcon, WalletIcon } from "@/components/ui/icons";
import { Price } from "@/components/ui/price";
import type { Locale } from "@/i18n/config";
import { formatMessage, getMessages, type CheckoutMessages } from "@/i18n/messages";
import { formatPrice } from "@/lib/format/money";

/**
 * Checkout summary rail.
 *
 * Every amount shown here is a *quote*: the authority is the checkout transaction
 * on the server, which re-reads the price while it holds the wallet lock. Nothing
 * on this panel is arithmetic the browser is trusted with — the total arrives
 * already computed, and the shortfall is only ever a difference between two
 * server-provided numbers.
 */
export type OrderSummaryProps = {
  locale: Locale;
  messages: CheckoutMessages;
  offerName: string;
  productName: string;
  productImage: string | null;
  unitPrice: number;
  quantity: number;
  total: number;
  currency: string;
  balance: number;
  /** Server-decided: the balance does not cover the total. */
  insufficient: boolean;
  shortfall: number;
  walletHref: string;
  /**
   * Admin checkout. The admin has no customer wallet, so the balance row and
   * shortfall notices are replaced by a gift note.
   */
  gift?: boolean;
};

function SummaryRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-3 py-2.5">
      <dt className="text-xs font-medium text-[var(--ink-faint)]">{label}</dt>
      <dd className="min-w-0 text-sm font-semibold text-[var(--ink)]">{children}</dd>
    </div>
  );
}

export function OrderSummary({
  locale,
  messages,
  offerName,
  productName,
  productImage,
  unitPrice,
  quantity,
  total,
  currency,
  balance,
  insufficient,
  shortfall,
  walletHref,
  gift = false,
}: OrderSummaryProps) {
  return (
    <div className="sf-commerce-panel sf-checkout-summary">
      <h2 className="sf-checkout-desktop-heading">{messages.summary.title}</h2>
      <h2 className="sf-checkout-wallet-heading">{gift ? messages.summary.title : getMessages(locale, "account").wallet.title}</h2>

      <div className="sf-checkout-product sf-checkout-product-desktop">
        <div className="sf-checkout-art"><StoreImage src={productImage} alt={productName} sizes="72px" /></div>
        <div className="sf-checkout-product-copy"><p>{productName}</p><span>{offerName}</span></div>
      </div>
      <dl className="sf-checkout-line-items mt-4 divide-y divide-[var(--line)]">
        <SummaryRow label={messages.summary.unitPriceLabel}>
          <span className="tabular-nums" dir="ltr">
            {formatPrice(unitPrice, currency, locale)}
          </span>
        </SummaryRow>
        <SummaryRow label={messages.summary.quantityLabel}>
          <span className="tabular-nums" dir="ltr">
            {quantity}
          </span>
        </SummaryRow>
      </dl>

      <div className="sf-checkout-total">
        <p className="text-xs font-medium text-[var(--ink-faint)]">{messages.summary.totalLabel}</p>
        <Price amount={total} currency={currency} locale={locale} size="lg" className="mt-2" />
        <p className="mt-2 text-xs leading-5 text-[var(--ink-muted)]">{messages.summary.totalHint}</p>
      </div>

      {gift ? (
        <NoticePanel className="mt-4" description={messages.summary.giftNote} />
      ) : (
        <>
          <div className="sf-checkout-balance">
            <p className="flex items-center gap-2 text-xs font-medium text-[var(--ink-faint)]">
              <WalletIcon className="size-4 text-[var(--accent)]" />
              {messages.summary.balanceLabel}
            </p>
            <p className="text-sm font-semibold text-[var(--ink)] tabular-nums" dir="ltr">
              {formatPrice(balance, currency, locale)}
            </p>
          </div>

          {insufficient ? (
            <div
              role="alert"
              className="mt-4 rounded-[var(--radius-card)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[var(--danger-surface)] p-4"
            >
              <p className="flex items-center gap-2 text-sm font-semibold text-[var(--danger)]">
                <AlertIcon className="size-4 shrink-0" />
                {messages.summary.insufficientTitle}
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">
                {formatMessage(messages.summary.insufficientDescription, {
                  amount: formatPrice(shortfall, currency, locale),
                })}
              </p>
              <ButtonLink href={walletHref} variant="secondary" size="sm" className="mt-4">
                {messages.summary.walletAction}
              </ButtonLink>
            </div>
          ) : (
            <NoticePanel
              className="mt-4"
              description={`${messages.summary.balanceAfterLabel}: ${formatPrice(
                balance - total,
                currency,
                locale,
              )}`}
            />
          )}
        </>
      )}

      {/*
        * Trust at the decision point. The home page carries the full trust
        * strip; here, where the customer is about to commit money, the two
        * claims that answer "is this safe and how long does it take" repeat in
        * miniature — the same pattern the offer page already runs.
        */}
      <div className="mt-5 grid gap-2.5 border-t border-[var(--line)] pt-4">
        <p className="flex items-start gap-2 text-xs leading-5 text-[var(--ink-muted)]">
          <BoltIcon className="mt-0.5 size-4 shrink-0 text-[var(--accent)]" />
          {messages.summary.trustInstant}
        </p>
        <p className="flex items-start gap-2 text-xs leading-5 text-[var(--ink-muted)]">
          <ShieldIcon className="mt-0.5 size-4 shrink-0 text-[var(--accent)]" />
          {messages.summary.trustSecure}
        </p>
      </div>
    </div>
  );
}
