import Link from "next/link";
import { DropdownAutoClose } from "@/components/layout/dropdown-auto-close";
import { WalletPanel } from "@/components/layout/wallet-panel";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { BellIcon, UserIcon, WalletIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";
import type { CommonMessages } from "@/i18n/messages";
import { signOutAction } from "@/lib/auth/actions";
import { formatPrice } from "@/lib/format/money";
import type { SessionSummary } from "@/lib/services/session.service";
import type { ShamCashWalletSnapshot } from "@/lib/services/shamcash-wallet.service";
import type { HeaderWalletPanel } from "@/lib/wallet-panel";

/**
 * Header account area.
 *
 * Server-rendered: a native `details` disclosure holds the menu, and sign-out is
 * a form posting to a server action, so the menu works before any JavaScript
 * arrives. {@link DropdownAutoClose} is the one client island, and only to
 * dismiss the panel once a link or button in it is used — the router swaps the
 * page without touching this element, so an open menu would otherwise sit on
 * top of wherever the click led.
 *
 * The ShamCash wallet pill is admin-only — it is operational information, and
 * fetching it for a visitor would call the provider for no reason.
 */
export type AccountMenuProps = {
  locale: Locale;
  messages: CommonMessages;
  session: SessionSummary | null;
  wallet: ShamCashWalletSnapshot | null;
  /**
   * Wallet balances for the panel below the profile entry — the customer's own
   * balance, or every customer wallet for an administrator. Null when signed out.
   */
  walletPanel: HeaderWalletPanel | null;
  /** Unread notifications; the bell is hidden entirely at zero. */
  unreadCount: number;
  notificationsLabel: string;
};

export function AccountMenu({
  locale,
  messages,
  session,
  wallet,
  walletPanel,
  unreadCount,
  notificationsLabel,
}: AccountMenuProps) {
  if (!session) {
    return (
      <ButtonLink href={`/${locale}/login`} variant="secondary" size="sm" className="shrink-0">
        {messages.account.signIn}
      </ButtonLink>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      {session.isAdmin && wallet ? (
        <Link
          href={`/${locale}/dashboard`}
          title={`${messages.account.walletLabel} · ${wallet.username}`}
          className="hidden min-h-10 items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm text-[var(--ink-soft)] transition-colors duration-[var(--duration)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] hover:text-[var(--ink)] md:flex"
        >
          <WalletIcon className="size-4 shrink-0 text-[var(--accent)]" />
          <span className="sr-only">{messages.account.walletLabel}</span>
          <span className="tabular-nums" dir="ltr">
            {formatPrice(wallet.balance, wallet.currency, locale)}
          </span>
        </Link>
      ) : null}

      {/*
        * Shown only when there is something to read. A permanently visible bell
        * with a zero is noise, and the menu below always carries the link.
        */}
      {unreadCount > 0 ? (
        <Link
          href={`/${locale}/notifications`}
          title={notificationsLabel}
          className="relative flex min-h-11 items-center gap-1.5 rounded-[var(--radius-pill)] border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-3 text-sm text-[var(--ink)] transition-colors duration-[var(--duration)] hover:border-[var(--accent)]"
        >
          <BellIcon className="size-4 shrink-0 text-[var(--accent)]" />
          <span className="sr-only">{notificationsLabel}</span>
          <span className="tabular-nums" dir="ltr">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        </Link>
      ) : null}

      <details className="relative">
        <summary
          className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm text-[var(--ink-soft)] transition-colors duration-[var(--duration)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
          aria-label={messages.account.accountMenuLabel}
        >
          <UserIcon className="size-4 shrink-0" />
          <span className="hidden max-w-28 truncate sm:inline">{session.displayName}</span>
        </summary>

        <DropdownAutoClose />

        <div className="absolute end-0 top-12 z-50 grid w-60 gap-3 rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface)] p-3 shadow-[var(--elevation-3)]">
          <div className="min-w-0 px-1">
            <p className="truncate text-sm font-semibold text-[var(--ink)]">{session.displayName}</p>
            {session.email ? (
              <p className="mt-0.5 truncate text-xs text-[var(--ink-muted)]" dir="ltr">
                {session.email}
              </p>
            ) : null}
            {session.isAdmin ? (
              <Badge tone="accent" className="mt-2">
                {messages.account.adminBadge}
              </Badge>
            ) : null}
          </div>

          <div className="grid gap-0.5">
            <Link
              href={`/${locale}/profile`}
              className="rounded-[var(--radius-control)] px-3 py-2.5 text-sm text-[var(--ink-soft)] transition-colors duration-[var(--duration)] hover:bg-[var(--shell)] hover:text-[var(--ink)]"
            >
              {messages.account.account}
            </Link>

            {/*
             * Wallets open in place rather than navigating: the balances are
             * the thing people check, so they render right here under the
             * profile entry. The destination link lives inside the disclosure.
             */}
            {walletPanel ? (
              <WalletPanel
                locale={locale}
                panel={walletPanel}
                labels={{
                  title: messages.account.wallets,
                  balance: messages.account.walletLabel,
                  openWallet: messages.account.openWallet,
                  openCustomers: messages.account.openCustomers,
                }}
              />
            ) : null}

            <Link
              href={`/${locale}/notifications`}
              className="flex items-center justify-between gap-2 rounded-[var(--radius-control)] px-3 py-2.5 text-sm text-[var(--ink-soft)] transition-colors duration-[var(--duration)] hover:bg-[var(--shell)] hover:text-[var(--ink)]"
            >
              {notificationsLabel}
              {unreadCount > 0 ? (
                <Badge tone="accent" className="shrink-0 tabular-nums">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </Badge>
              ) : null}
            </Link>
            {session.isAdmin ? (
              <Link
                href={`/${locale}/dashboard`}
                className="rounded-[var(--radius-control)] px-3 py-2.5 text-sm text-[var(--ink-soft)] transition-colors duration-[var(--duration)] hover:bg-[var(--shell)] hover:text-[var(--ink)]"
              >
                {messages.account.dashboard}
              </Link>
            ) : null}
          </div>

          {session.isAdmin && wallet ? (
            <p className="rounded-[var(--radius-control)] bg-[var(--shell)] px-3 py-2 text-xs text-[var(--ink-muted)] md:hidden">
              {messages.account.walletLabel}:{" "}
              <span className="tabular-nums" dir="ltr">
                {formatPrice(wallet.balance, wallet.currency, locale)}
              </span>
            </p>
          ) : null}

          <form action={signOutAction} className="border-t border-[var(--line)] pt-2">
            <input type="hidden" name="locale" value={locale} />
            <Button type="submit" variant="dangerGhost" size="sm" fullWidth>
              {messages.account.signOut}
            </Button>
          </form>
        </div>
      </details>
    </div>
  );
}
