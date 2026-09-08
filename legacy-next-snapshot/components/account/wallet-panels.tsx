import Link from "next/link";
import { EmptyState, NoticePanel } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { ArrowIcon, WalletIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";
import type { AccountMessages } from "@/i18n/messages";
import { formatPrice } from "@/lib/format/money";
import type { WalletSummary, WalletTransaction } from "@/lib/services/wallet.service";

/**
 * Wallet balance and history.
 *
 * A stored amount is signed — a purchase is negative — so the sign is rendered
 * explicitly alongside the type label. Colour only reinforces it; a customer who
 * cannot distinguish the two hues still reads "+" or "−" and the word.
 */

export function WalletSummaryPanel({
  locale,
  messages,
  wallet,
  detailHref,
  rechargeHref,
}: {
  locale: Locale;
  messages: AccountMessages;
  wallet: WalletSummary | null;
  /** Omit on the wallet page itself. */
  detailHref?: string;
  /** Present once recharge exists; otherwise an honest note is shown instead. */
  rechargeHref?: string;
}) {
  const currency = wallet?.currency ?? "USD";

  return (
    <div className="rounded-[var(--radius-shell)] border border-[var(--line)] bg-[var(--shell)] p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-xs font-medium text-[var(--ink-faint)]">
            <WalletIcon className="size-4 text-[var(--accent)]" />
            {messages.wallet.balanceLabel}
          </p>
          <p className="mt-3 text-[clamp(1.75rem,4vw,2.5rem)] leading-none font-semibold tracking-tight text-[var(--ink)] tabular-nums">
            {formatPrice(wallet?.balance ?? 0, currency, locale)}
          </p>
        </div>

        {detailHref ? (
          <Link
            href={detailHref}
            className="inline-flex min-h-10 items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--line)] px-4 text-sm text-[var(--ink-soft)] transition-colors duration-[var(--duration)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
          >
            {messages.wallet.title}
            <ArrowIcon direction="end" className="size-3.5 rtl:rotate-180" />
          </Link>
        ) : null}
      </div>

      {rechargeHref ? (
        <Link
          href={rechargeHref}
          className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-ink)] transition-colors duration-[var(--duration)] hover:bg-[var(--accent-strong)]"
        >
          {messages.wallet.rechargeAction}
          <ArrowIcon direction="end" className="size-4 rtl:rotate-180" />
        </Link>
      ) : (
        <NoticePanel className="mt-5" description={messages.wallet.rechargeSoon} />
      )}
    </div>
  );
}

export function TransactionList({
  locale,
  messages,
  transactions,
}: {
  locale: Locale;
  messages: AccountMessages;
  transactions: WalletTransaction[];
}) {
  if (transactions.length === 0) {
    return (
      <EmptyState
        icon={<WalletIcon />}
        title={messages.wallet.emptyTitle}
        description={messages.wallet.emptyDescription}
      />
    );
  }

  return (
    <ul className="grid gap-2">
      {transactions.map((transaction) => {
        const isCredit = transaction.amount > 0;
        const magnitude = Math.abs(transaction.amount);

        return (
          <li
            key={transaction.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] px-4 py-3"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={isCredit ? "success" : "neutral"}>
                  {messages.wallet.types[transaction.type]}
                </Badge>
                <time
                  className="text-xs text-[var(--ink-faint)] tabular-nums"
                  dateTime={transaction.createdAt}
                  dir="ltr"
                >
                  {transaction.createdAt.slice(0, 16).replace("T", " ")}
                </time>
              </div>
              {transaction.description ? (
                <p className="mt-1.5 truncate text-xs text-[var(--ink-muted)]">
                  {transaction.description}
                </p>
              ) : null}
            </div>

            <div className="text-end">
              <p
                className={
                  isCredit
                    ? "text-sm font-semibold text-[var(--success)] tabular-nums"
                    : "text-sm font-semibold text-[var(--ink)] tabular-nums"
                }
                dir="ltr"
              >
                {isCredit ? "+" : "−"}
                {formatPrice(magnitude, "USD", locale)}
              </p>
              <p className="mt-0.5 text-xs text-[var(--ink-faint)] tabular-nums" dir="ltr">
                {messages.wallet.columnBalance}: {formatPrice(transaction.balanceAfter, "USD", locale)}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
