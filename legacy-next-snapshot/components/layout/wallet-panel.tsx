import Link from "next/link";
import { ChevronIcon, WalletIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";
import {
  formatHeaderWalletAmount,
  type HeaderWalletPanel,
} from "@/lib/wallet-panel";

/**
 * Expandable wallet balances for the account menus.
 *
 * One component for both chrome surfaces: the desktop dropdown and the mobile
 * drawer render the same native `details` disclosure, so pressing "Wallets" —
 * which sits directly below the profile entry in either surface — opens the
 * balances inline rather than navigating away. A customer sees their own
 * balance; an administrator sees every customer wallet, richest first, in a
 * scrollable list.
 *
 * Server-rendered and JS-free: opening relies on the platform, matching how
 * both parents already work.
 */
export function WalletPanel({
  locale,
  panel,
  labels,
}: {
  locale: Locale;
  panel: HeaderWalletPanel;
  labels: { title: string; balance: string; openWallet: string; openCustomers: string };
}) {
  const isAdmin = panel.kind === "admin";
  const openHref = isAdmin
    ? `/${locale}/dashboard/customers`
    : `/${locale}/wallet`;
  const openLabel = isAdmin ? labels.openCustomers : labels.openWallet;

  return (
    <details className="group rounded-[var(--radius-control)]">
      <summary
        className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-[var(--radius-control)] px-3 py-2.5 text-sm text-[var(--ink-soft)] transition-colors duration-[var(--duration)] hover:bg-[var(--shell)] hover:text-[var(--ink)]"
        aria-label={labels.title}
      >
        <span className="flex items-center gap-2">
          <WalletIcon className="size-4 shrink-0 text-[var(--accent)]" />
          {labels.title}
        </span>
        <ChevronIcon
          direction="down"
          className="size-4 shrink-0 text-[var(--ink-faint)] transition-transform duration-[var(--duration)] group-open:rotate-180"
        />
      </summary>

      <div className="mt-1 grid gap-0.5">
        {panel.kind === "customer" ? (
          <p className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
            <span className="text-[var(--ink-muted)]">{labels.balance}</span>
            <span className="font-semibold text-[var(--ink)] tabular-nums" dir="ltr">
              {formatHeaderWalletAmount(panel.balance, panel.currency, locale)}
            </span>
          </p>
        ) : (
          <div className="grid max-h-56 gap-0.5 overflow-y-auto overscroll-contain">
            {panel.rows.length === 0 ? (
              <p className="px-3 py-2 text-sm text-[var(--ink-muted)]">{labels.balance}: 0</p>
            ) : (
              panel.rows.map((row) => (
                <p
                  key={row.id}
                  className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm"
                >
                  <span className="min-w-0 truncate text-[var(--ink-muted)]">{row.label}</span>
                  <span className="shrink-0 font-medium text-[var(--ink)] tabular-nums" dir="ltr">
                    {formatHeaderWalletAmount(row.balance, row.currency, locale)}
                  </span>
                </p>
              ))
            )}
          </div>
        )}

        <Link
          href={openHref}
          className="mt-0.5 flex items-center justify-between gap-2 rounded-[var(--radius-control)] px-3 py-2 text-xs font-medium text-[var(--accent)] transition-colors duration-[var(--duration)] hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]"
        >
          {openLabel}
          <ChevronIcon direction="end" className="size-3.5 shrink-0 rtl:rotate-180" />
        </Link>
      </div>
    </details>
  );
}
