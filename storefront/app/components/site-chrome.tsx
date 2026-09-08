import { createPortal } from "react-dom";
import { Form, Link, NavLink, useLocation, useNavigation } from "react-router";
import { useEffect, useRef, useState } from "react";
import { getLocaleDirection, type Locale } from "@/i18n/config";
import { getMessages, type CommonMessages } from "@/i18n/messages";
import type { ThemeSettings } from "@server/lib/settings/theme-settings";
import { BrandWordmark } from "@/components/layout/brand-wordmark";
import { SearchField } from "@/components/search/search-field";
import {
  SearchIcon,
  CloseIcon,
  MenuIcon,
  MoonIcon,
  SunIcon,
  WalletIcon,
  BellIcon,
  GlobeIcon,
} from "@/components/ui/icons";
import { formatPrice } from "@/lib/format/money";

export type ChromeSession = {
  userId: string;
  email: string | null;
  displayName: string;
  avatarUrl: string | null;
  isAdmin: boolean;
} | null;
export type ChromeWalletPanel = {
  kind: "customer";
  balance: number;
  currency: string;
} | null;
export type ChromeSocialLink =
  import("@/lib/settings/public-settings").SocialLink;
export type ChromeData = {
  locale: Locale;
  session: ChromeSession;
  walletPanel: ChromeWalletPanel;
  unreadCount: number;
  brandName: string;
  showLogo?: boolean;
  socialLinks: ChromeSocialLink[];
  year: number;
  theme?: ThemeSettings;
  maintenance?: { message: string } | null;
};
const control =
  "grid size-11 shrink-0 place-items-center rounded-full border border-[var(--line)] text-[var(--ink-soft)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--ink)] [&>svg]:size-4.5";
function ThemeToggle({ label }: { label: string }) {
  return (
    <button
      type="button"
      className={control}
      aria-label={label}
      onClick={() => {
        const current = document.documentElement.dataset.theme;
        const next = current === "light" ? "dark" : "light";
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem("gh-store-theme", next);
          localStorage.setItem("gh-theme", next);
          document.cookie = `gh-theme=${next}; path=/; max-age=31536000; SameSite=Lax`;
        } catch {}
      }}
    >
      <SunIcon className="gh-only-dark" />
      <MoonIcon className="gh-only-light" />
    </button>
  );
}

export function SiteHeader({
  locale,
  messages,
  data,
  notificationsLabel,
}: {
  locale: Locale;
  messages: CommonMessages;
  data: ChromeData;
  notificationsLabel: string;
}) {
  const { session, walletPanel, unreadCount, brandName } = data;
  const location = useLocation();
  const navigation = useNavigation();
  const drawer = useRef<HTMLDialogElement>(null);
  const account = useRef<HTMLDivElement>(null);
  const accountButton = useRef<HTMLButtonElement>(null);
  const [accountPopover, setAccountPosition] = useState<{
    top: number;
    right: number;
    locationKey: string;
  } | null>(null);
  const accountPosition =
    accountPopover?.locationKey === location.key ? accountPopover : null;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const search = getMessages(locale, "search");
  const primaryItems = [
    { href: `/${locale}`, label: messages.navigation.home },
    { href: `/${locale}/games`, label: messages.navigation.games },
    { href: `/${locale}/gift-cards`, label: messages.navigation.giftCards },
    { href: `/${locale}/products`, label: messages.navigation.products },
    { href: `/${locale}/sale`, label: messages.navigation.offers },
  ];
  const accountItems = [
    { href: `/${locale}/profile`, label: messages.account.account },
    {
      href: `/${locale}/orders`,
      label: locale === "ar" ? "طلباتي" : "My orders",
    },
    { href: `/${locale}/wallet`, label: messages.account.openWallet },
    {
      href: `/${locale}/notifications`,
      label: notificationsLabel + (unreadCount ? ` (${unreadCount})` : ""),
    },
    { href: `/${locale}/support`, label: messages.links.support },
    ...(session?.isAdmin
      ? [{ href: `/${locale}/dashboard`, label: messages.account.dashboard }]
      : []),
  ];
  const secondaryItems = [
    { href: `/${locale}/faq`, label: messages.links.faq },
    { href: `/${locale}/how`, label: messages.links.how },
    { href: `/${locale}/contact`, label: messages.links.contact },
  ];
  const otherLocale = locale === "ar" ? "en" : "ar";
  const switchHref =
    location.pathname.replace(/^\/(ar|en)(?=\/|$)/, `/${otherLocale}`) +
    location.search +
    location.hash;
  useEffect(() => {
    drawer.current?.close();
  }, [location.pathname, location.search]);
  useEffect(() => {
    const onClick = (event: PointerEvent) => {
      if (
        account.current &&
        !account.current.contains(event.target as Node) &&
        !accountButton.current?.contains(event.target as Node)
      )
        setAccountPosition(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAccountPosition(null);
    };
    document.addEventListener("pointerdown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);
  const signOut = (
    <Form method="post" action={`/${locale}`}>
      <input type="hidden" name="intent" value="sign-out" />
      <button
        className="min-h-11 w-full rounded-xl px-3 text-start text-sm text-[var(--danger)] hover:bg-[var(--surface-strong)]"
        type="submit"
      >
        {messages.account.signOut}
      </button>
    </Form>
  );
  return (
    <header data-site-header className="sticky top-0 z-40 pt-3 sm:pt-5">
      {navigation.state !== "idle" ? (
        <div
          role="progressbar"
          aria-label={locale === "ar" ? "جار التحميل" : "Loading"}
          className="fixed inset-x-0 top-0 h-0.5 origin-left animate-pulse bg-[var(--accent)]"
        />
      ) : null}
      <div className="gh-page">
        <div
          dir="ltr"
          className="gh-sheen flex min-h-16 items-center gap-3 rounded-full border border-[var(--line)] bg-[color-mix(in_srgb,var(--canvas-raised)_82%,transparent)] px-3 shadow-[var(--elevation-2)] backdrop-blur-2xl sm:gap-4 sm:px-4"
        >
          <Link
            to={`/${locale}`}
            className="flex shrink-0 items-center gap-2.5"
            aria-label={brandName}
          >
            <img
              src="/gh-store-logo-mark.png"
              alt=""
              width="36"
              height="36"
              className="gh-logo-theme size-9 rounded-[var(--radius-control)]"
            />
            <BrandWordmark name={brandName} />
          </Link>
          <nav
            className="hidden items-center gap-0.5 lg:flex"
            aria-label={messages.navigation.primaryLabel}
          >
            {primaryItems.map((item) => (
              <NavLink
                key={item.href}
                to={item.href}
                end
                className={({ isActive }) =>
                  `rounded-full px-3 py-2 text-sm transition-colors ${isActive ? "bg-[var(--surface-strong)] text-[var(--ink)]" : "text-[var(--ink-muted)] hover:text-[var(--ink)]"}`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="ms-auto flex items-center gap-2">
            <SearchField
              locale={locale}
              size="sm"
              className="hidden w-56 xl:block"
              labels={{
                fieldLabel: search.fieldLabel,
                placeholder: messages.actions.searchPlaceholder,
                submit: search.submit,
                clear: search.clear,
                suggestionsLabel: search.suggestionsLabel,
              }}
            />
            {session && walletPanel ? (
              <Link
                to={`/${locale}/wallet`}
                aria-label={messages.account.walletLabel}
                className="hidden min-h-11 items-center gap-1.5 rounded-full border border-[var(--accent-line)] bg-[var(--accent-soft)] px-3 text-sm font-semibold sm:flex"
              >
                <WalletIcon className="size-4" />
                <bdi dir="ltr">
                  {formatPrice(
                    walletPanel.balance,
                    walletPanel.currency,
                    locale,
                  )}
                </bdi>
              </Link>
            ) : null}
            <Link
              to={`/${locale}/search`}
              aria-label={messages.actions.search}
              className={`${control} xl:hidden`}
            >
              <SearchIcon />
            </Link>
            <Link
              to={`/${locale}/notifications`}
              aria-label={notificationsLabel || (locale === "ar" ? "الإشعارات" : "Notifications")}
              title={notificationsLabel || (locale === "ar" ? "الإشعارات" : "Notifications")}
              className={`${control} relative`}
            >
              <BellIcon className="size-4" />
              {unreadCount ? (
                <span className="absolute -top-1 -end-1 flex min-w-4 h-4 px-1 items-center justify-center rounded-full bg-[var(--danger)] text-[10px] font-bold text-white shadow-xs leading-none">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              ) : null}
            </Link>
            <Link
              to={switchHref}
              aria-label={messages.locale.switchLabel}
              title={messages.locale.switchLabel}
              className={`${control}`}
            >
              <GlobeIcon className="size-4" />
            </Link>
            <div className="hidden lg:block">
              <ThemeToggle label={messages.theme.toggleLabel} />
            </div>
            <div className="hidden lg:block">
              {session ? (
                <div className="relative">
                  <button
                    type="button"
                    ref={accountButton}
                    aria-expanded={!!accountPosition}
                    aria-controls="site-account-menu"
                    onClick={() => {
                      if (accountPosition) {
                        setAccountPosition(null);
                        return;
                      }
                      const box =
                        accountButton.current?.getBoundingClientRect();
                      if (box)
                        setAccountPosition({
                          top: box.bottom + 8,
                          locationKey: location.key,
                          right: Math.max(16, window.innerWidth - box.right),
                        });
                    }}
                    aria-label={messages.account.accountMenuLabel}
                    className={`${control} cursor-pointer list-none font-bold [&::-webkit-details-marker]:hidden`}
                  >
                    {session.avatarUrl ? (
                      <img
                        src={session.avatarUrl}
                        alt=""
                        className="size-full rounded-full"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      session.displayName.slice(0, 1)
                    )}
                  </button>
                  {accountPosition
                    ? createPortal(
                        <div
                          ref={account}
                          id="site-account-menu"
                          dir={getLocaleDirection(locale)}
                          style={{
                            top: accountPosition.top,
                            right: accountPosition.right,
                          }}
                          className="fixed z-50 max-h-[calc(100dvh-7rem)] w-64 overflow-y-auto rounded-[var(--radius-card)] border bg-[var(--surface)] p-2 text-[var(--ink)] shadow-[var(--elevation-3)]"
                        >
                          <p className="px-3 py-2 font-semibold">
                            {session.displayName}
                          </p>
                          {accountItems.map((item) => (
                            <Link
                              key={item.href}
                              to={item.href}
                              className="flex min-h-11 items-center rounded-xl px-3 text-sm hover:bg-[var(--surface-strong)]"
                            >
                              {item.label}
                            </Link>
                          ))}
                          {signOut}
                        </div>,
                        document.body,
                      )
                    : null}
                </div>
              ) : (
                <Link
                  to={`/${locale}/login`}
                  className="inline-flex min-h-11 items-center rounded-full bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-ink)]"
                >
                  {messages.account.signIn}
                </Link>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                if (drawerOpen) drawer.current?.close();
                else {
                  drawer.current?.showModal();
                  setDrawerOpen(true);
                }
              }}
              aria-expanded={drawerOpen}
              aria-controls="site-mobile-menu"
              className={`${control} lg:hidden`}
              aria-label={
                drawerOpen
                  ? messages.navigation.close
                  : messages.navigation.menu
              }
            >
              <MenuIcon />
            </button>
          </div>
        </div>
      </div>
      <dialog
        id="site-mobile-menu"
        onClose={() => setDrawerOpen(false)}
        aria-label={messages.navigation.mobileLabel}
        ref={drawer}
        dir={getLocaleDirection(locale)}
        className="gh-drawer m-0 ms-auto h-dvh max-h-none w-[min(22rem,90vw)] max-w-none border-s border-[var(--line)] bg-[var(--canvas-raised)] p-5 text-[var(--ink)] shadow-[var(--elevation-3)] backdrop:bg-black/55"
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            const box = event.currentTarget.getBoundingClientRect();
            if (event.clientX < box.left || event.clientX > box.right)
              drawer.current?.close();
          }
        }}
      >
        <div className="flex items-center justify-between">
          <BrandWordmark name={brandName} />
          <button
            type="button"
            className={control}
            onClick={() => drawer.current?.close()}
            aria-label={messages.navigation.close}
          >
            <CloseIcon />
          </button>
        </div>
        <div className="my-5 border-y py-4">
          {session ? (
            <>
              <Link
                to={`/${locale}/profile`}
                className="block text-lg font-semibold"
              >
                {session.displayName}
              </Link>
              <p className="mt-1 truncate text-sm text-[var(--ink-muted)]">
                <bdi>{session.email}</bdi>
              </p>
              {walletPanel ? (
                <Link
                  to={`/${locale}/wallet`}
                  className="mt-3 flex justify-between rounded-xl bg-[var(--surface)] p-3"
                >
                  <span>{messages.account.walletLabel}</span>
                  <bdi dir="ltr">
                    {formatPrice(
                      walletPanel.balance,
                      walletPanel.currency,
                      locale,
                    )}
                  </bdi>
                </Link>
              ) : null}
            </>
          ) : (
            <Link
              to={`/${locale}/login`}
              className="flex min-h-11 justify-center rounded-full bg-[var(--accent)] p-3 font-semibold text-[var(--accent-ink)]"
            >
              {messages.account.signIn}
            </Link>
          )}
        </div>
        <nav
          aria-label={messages.navigation.mobileLabel}
          className="grid gap-1"
        >
          {primaryItems.map((item) => (
            <NavLink
              key={item.href}
              end
              to={item.href}
              className={({ isActive }) =>
                `rounded-xl px-3 py-3 font-medium ${isActive ? "bg-[var(--surface-strong)] text-[var(--accent)]" : "hover:bg-[var(--surface)]"}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        {session ? (
          <nav className="mt-4 grid gap-1 border-t pt-4">
            {accountItems.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                className="rounded-xl px-3 py-3 text-sm hover:bg-[var(--surface)]"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        ) : null}
        <nav className="mt-4 grid gap-1 border-t pt-4">
          {secondaryItems.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              className="rounded-xl px-3 py-3 text-sm text-[var(--ink-muted)]"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-4 flex items-center justify-between border-t pt-4">
          <ThemeToggle label={messages.theme.toggleLabel} />
          {session ? signOut : null}
        </div>
      </dialog>
    </header>
  );
}
export { SiteFooter } from "@/components/layout/site-footer";
