import Link from "next/link";
import { Suspense } from "react";
import { AccountMenu } from "@/components/layout/account-menu";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { MobileNav } from "@/components/layout/mobile-nav";
import { NavLink } from "@/components/layout/nav-link";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { SearchField } from "@/components/search/search-field";
import { SearchIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";
import type { CommonMessages, SearchMessages } from "@/i18n/messages";
import { BRAND } from "@/lib/brand";
import type { G2BulkWalletSnapshot } from "@/lib/services/g2bulk-wallet.service";
import type { SessionSummary } from "@/lib/services/session.service";

/**
 * Storefront header.
 *
 * A floating glass bar detached from the viewport edge rather than glued to it.
 * Desktop shows inline navigation and a search field; mobile collapses to a
 * search shortcut and an overlay menu.
 */
export type SiteHeaderProps = {
  locale: Locale;
  messages: CommonMessages;
  searchMessages: SearchMessages;
  session: SessionSummary | null;
  /** Supplier balance, shown to administrators only. */
  wallet: G2BulkWalletSnapshot | null;
  /** Unread notifications for the signed-in reader; 0 for a visitor. */
  unreadCount: number;
  notificationsLabel: string;
};

export function SiteHeader({
  locale,
  messages,
  searchMessages,
  session,
  wallet,
  unreadCount,
  notificationsLabel,
}: SiteHeaderProps) {
  const primaryItems = [
    { href: `/${locale}`, label: messages.navigation.home },
    { href: `/${locale}/games`, label: messages.navigation.games },
    { href: `/${locale}/gift-cards`, label: messages.navigation.giftCards },
    { href: `/${locale}/sale`, label: messages.navigation.offers },
  ];

  const secondaryItems = [
    { href: `/${locale}/search`, label: messages.links.search },
    { href: `/${locale}/faq`, label: messages.links.faq },
    { href: `/${locale}/how`, label: messages.links.how },
    { href: `/${locale}/contact`, label: messages.links.contact },
  ];

  return (
    <header className="sticky top-0 z-40 pt-3 sm:pt-5">
      <div className="gh-page">
        <div className="gh-sheen flex min-h-16 items-center gap-3 rounded-[var(--radius-pill)] border border-[var(--line)] bg-[color-mix(in_srgb,var(--canvas-raised)_82%,transparent)] px-3 shadow-[var(--elevation-2)] backdrop-blur-2xl sm:gap-4 sm:px-4">
          <Link href={`/${locale}`} className="flex shrink-0 items-center gap-2.5" aria-label={BRAND.name}>
            <span
              className="grid size-9 place-items-center rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[linear-gradient(140deg,color-mix(in_srgb,var(--accent)_28%,var(--surface-strong)),var(--surface-strong))] text-xs font-bold text-[var(--accent-strong)]"
              aria-hidden="true"
            >
              GH
            </span>
            <span className="hidden text-[0.9375rem] font-semibold tracking-tight text-[var(--ink)] sm:inline">
              {BRAND.name}
            </span>
          </Link>

          <nav className="hidden items-center gap-0.5 lg:flex" aria-label={messages.navigation.primaryLabel}>
            {primaryItems.map((item) => (
              <NavLink key={item.href} href={item.href}>
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ms-auto flex items-center gap-2">
            <SearchField
              locale={locale}
              size="sm"
              className="hidden w-64 xl:flex"
              labels={{
                fieldLabel: searchMessages.fieldLabel,
                placeholder: messages.actions.searchPlaceholder,
                submit: searchMessages.submit,
                clear: searchMessages.clear,
              }}
            />

            <Link
              href={`/${locale}/search`}
              aria-label={messages.actions.search}
              className="grid size-10 shrink-0 place-items-center rounded-full border border-[var(--line)] text-[var(--ink-soft)] transition-colors duration-[var(--duration)] hover:border-[var(--line-strong)] hover:text-[var(--ink)] xl:hidden [&>svg]:size-4.5"
            >
              <SearchIcon />
            </Link>

            {/*
             * The switcher reads the query string to preserve it across a
             * language change, which makes it a request-time dependency. The
             * boundary keeps that out of the static shell.
             */}
            <Suspense fallback={null}>
              <div className="hidden sm:block">
                <LocaleSwitcher locale={locale} labels={messages.locale} />
              </div>
            </Suspense>

            <ThemeToggle labels={messages.theme} />

            <AccountMenu
              locale={locale}
              messages={messages}
              session={session}
              wallet={wallet}
              unreadCount={unreadCount}
              notificationsLabel={notificationsLabel}
            />

            <MobileNav
              labels={{
                menu: messages.navigation.menu,
                close: messages.navigation.close,
                mobileLabel: messages.navigation.mobileLabel,
              }}
              items={primaryItems}
              footerItems={secondaryItems}
            />
          </div>
        </div>
      </div>
    </header>
  );
}
