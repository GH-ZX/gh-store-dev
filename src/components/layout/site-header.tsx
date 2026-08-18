import Link from "next/link";
import { Suspense } from "react";
import { AccountMenu } from "@/components/layout/account-menu";
import { BrandWordmark } from "@/components/layout/brand-wordmark";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { MobileNav } from "@/components/layout/mobile-nav";
import { NavLink } from "@/components/layout/nav-link";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { SearchField } from "@/components/search/search-field";
import { Button } from "@/components/ui/button";
import { SearchIcon } from "@/components/ui/icons";
import { getLocaleDirection, type Locale } from "@/i18n/config";
import type { CommonMessages, SearchMessages } from "@/i18n/messages";
import { signOutAction } from "@/lib/auth/actions";
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
  /** Resolved display name for the chrome (built-in brand unless set everywhere). */
  brandName: string;
};

export function SiteHeader({
  locale,
  messages,
  searchMessages,
  session,
  wallet,
  unreadCount,
  notificationsLabel,
  brandName,
}: SiteHeaderProps) {
  const primaryItems = [
    { href: `/${locale}`, label: messages.navigation.home },
    { href: `/${locale}/games`, label: messages.navigation.games },
    { href: `/${locale}/gift-cards`, label: messages.navigation.giftCards },
    { href: `/${locale}/sale`, label: messages.navigation.offers },
  ];

  // Search is not among them: the bar already carries a search button at every
  // width, so a second entry inside the drawer is the same door twice.
  const secondaryItems = [
    { href: `/${locale}/faq`, label: messages.links.faq },
    { href: `/${locale}/how`, label: messages.links.how },
    { href: `/${locale}/contact`, label: messages.links.contact },
  ];

  /*
   * The account rows inside the mobile drawer. Below `lg` the dropdown in the
   * bar is hidden, so this is the only way to an account on a phone — which is
   * also what keeps the bar down to a logo, a search and the menu.
   *
   * Neither the profile nor notifications is here: the identity block at the top
   * of the drawer already is the profile link, and notifications sit beside it
   * as a bell. Repeating either as a row would be the same destination twice.
   */
  const accountLinks = session
    ? [
        { href: `/${locale}/wallet`, label: messages.account.walletLabel },
        { href: `/${locale}/support`, label: messages.links.support },
        ...(session.isAdmin
          ? [{ href: `/${locale}/dashboard`, label: messages.account.dashboard }]
          : []),
      ]
    : [];

  return (
    // Marked so the print stylesheet can take the chrome off an invoice.
    <header data-site-header className="sticky top-0 z-40 pt-3 sm:pt-5">
      <div className="gh-page">
        {/*
          * The bar does not mirror. `dir="ltr"` pins the physical order — mark on
          * the left, controls on the right — in both languages, so switching to
          * Arabic does not throw the logo and the menu button to opposite sides
          * of the screen from where the eye left them. Only the box order is
          * pinned; Arabic words inside still shape and read right-to-left.
          *
          * Anything positioned relative to the viewport rather than to this bar
          * has to opt back out, or it would inherit a direction that is a layout
          * decision about the header and nothing else. The drawer does exactly
          * that below.
          */}
        <div
          dir="ltr"
          className="gh-sheen flex min-h-16 items-center gap-3 rounded-[var(--radius-pill)] border border-[var(--line)] bg-[color-mix(in_srgb,var(--canvas-raised)_82%,transparent)] px-3 shadow-[var(--elevation-2)] backdrop-blur-2xl sm:gap-4 sm:px-4"
        >
          <Link href={`/${locale}`} className="flex shrink-0 items-center gap-2.5" aria-label={brandName}>
            <img
              src="/gh-store-logo.png"
              alt=""
              width={36}
              height={36}
              className="gh-logo-theme size-9 shrink-0 rounded-[var(--radius-control)] object-cover"
              aria-hidden="true"
            />
            <BrandWordmark name={brandName} />
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
              <LocaleSwitcher locale={locale} labels={messages.locale} />
            </Suspense>

            {/* Below `lg` this lives in the drawer instead. */}
            <div className="hidden lg:block">
              <ThemeToggle labels={messages.theme} />
            </div>

            {/* Below `lg` the same links live inside the menu panel instead. */}
            <div className="hidden lg:block">
              <AccountMenu
                locale={locale}
                messages={messages}
                session={session}
                wallet={wallet}
                unreadCount={unreadCount}
                notificationsLabel={notificationsLabel}
              />
            </div>

            <MobileNav
              // The bar is pinned to `ltr`; the drawer belongs to the document,
              // so it is handed the reading direction back explicitly.
              dir={getLocaleDirection(locale)}
              labels={{
                menu: messages.navigation.menu,
                close: messages.navigation.close,
                mobileLabel: messages.navigation.mobileLabel,
              }}
              items={primaryItems}
              footerItems={secondaryItems}
              account={{
                name: session?.displayName ?? null,
                email: session?.email ?? null,
                avatarUrl: session?.avatarUrl ?? null,
                href: `/${locale}/profile`,
                notifications: {
                  href: `/${locale}/notifications`,
                  label: notificationsLabel,
                  count: unreadCount,
                },
                links: accountLinks,
                signIn: { href: `/${locale}/login`, label: messages.account.signIn },
              }}
              themeToggle={<ThemeToggle labels={messages.theme} />}
              signOut={
                session ? (
                  <form action={signOutAction}>
                    <input type="hidden" name="locale" value={locale} />
                    <Button type="submit" variant="dangerGhost" size="sm">
                      {messages.account.signOut}
                    </Button>
                  </form>
                ) : null
              }
            />
          </div>
        </div>
      </div>
    </header>
  );
}
