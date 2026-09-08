import { Form, Link, useLocation, useNavigation } from "react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { type Locale } from "@/i18n/config";
import {
  BellIcon,
  CloseIcon,
  GlobeIcon,
  MenuIcon,
  MoonIcon,
  SunIcon,
  UserIcon,
  WalletIcon,
} from "@/components/ui/icons";
import { formatPrice } from "@/lib/format/money";

export const headerControlClass = "sf-control";

export function StorefrontBrand({ name = "GH Store" }: { name?: string }) {
  const [first, ...rest] = (name || "GH Store").trim().split(/\s+/);
  return (
    <div className="flex items-center gap-2.5">
      <img
        src="/gh-store-logo-mark.png"
        alt=""
        width="36"
        height="36"
        className="gh-logo-theme size-9 rounded-[var(--radius-control,8px)] shadow-xs"
      />
      <span className="sf-brand font-bold text-lg tracking-tight text-[var(--ink)]" dir="auto">
        <span>{first}</span>
        {rest.length ? <span>{rest.join(" ")}</span> : null}
      </span>
    </div>
  );
}

export function ThemeToggle({ label }: { label: string }) {
  return (
    <button
      type="button"
      className={headerControlClass}
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

export interface HeaderShellProps {
  locale: Locale;
  brandName?: string;
  brandHref?: string;
  brandBadge?: ReactNode;
  center?: ReactNode;
  actions?: ReactNode;
  subnav?: ReactNode;
  drawer?: ReactNode;
  loadingLabel?: string;
}

export function HeaderShell({
  locale,
  brandName = "GH Store",
  brandHref,
  brandBadge,
  center,
  actions,
  subnav,
  drawer,
  loadingLabel = "Loading",
}: HeaderShellProps) {
  const navigation = useNavigation();
  const homeHref = brandHref || `/${locale}`;

  return (
    <header data-site-header className="sf-site-header">
      {navigation.state !== "idle" ? (
        <div
          role="progressbar"
          aria-label={loadingLabel}
          className="sf-navigation-progress"
        />
      ) : null}

      <div className="gh-page sf-header-main">
        <Link
          to={homeHref}
          className="sf-brand-link flex items-center gap-2.5"
          aria-label={brandName}
        >
          <StorefrontBrand name={brandName} />
          {brandBadge}
        </Link>

        {center}

        {actions}
      </div>

      {subnav}

      {drawer}
    </header>
  );
}

export interface HeaderActionsProps {
  locale: Locale;
  unreadCount?: number;
  notificationsLabel?: string;
  switchLocaleLabel?: string;
  themeToggleLabel?: string;
  walletPanel?: { balance: number; currency: string } | null;
  session?: {
    displayName?: string | null;
    email?: string | null;
    avatarUrl?: string | null;
  } | null;
  accountItems?: { href: string; label: string }[];
  signedInAsLabel?: string;
  accountMenuLabel?: string;
  onOpenDrawer: () => void;
  openDrawerLabel?: string;
}

export function HeaderActions({
  locale,
  unreadCount = 0,
  notificationsLabel = "Notifications",
  switchLocaleLabel = "Language",
  themeToggleLabel = "Toggle theme",
  walletPanel,
  session,
  accountItems = [],
  signedInAsLabel = "Signed in as",
  accountMenuLabel = "Account menu",
  onOpenDrawer,
  openDrawerLabel = "Open menu",
}: HeaderActionsProps) {
  const location = useLocation();
  const otherLocale: Locale = locale === "ar" ? "en" : "ar";
  const switchHref =
    location.pathname.replace(/^\/(ar|en)(?=\/|$)/, `/${otherLocale}`) +
    location.search +
    location.hash;

  const accountRef = useRef<HTMLDivElement>(null);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  const [accountPopover, setAccountPosition] = useState<{
    top: number;
    right: number;
    locationKey: string;
  } | null>(null);

  const accountPosition =
    accountPopover?.locationKey === location.key ? accountPopover : null;

  useEffect(() => {
    const onClick = (event: PointerEvent) => {
      if (
        accountRef.current &&
        !accountRef.current.contains(event.target as Node) &&
        !accountButtonRef.current?.contains(event.target as Node)
      ) {
        setAccountPosition(null);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (accountRef.current?.contains(document.activeElement)) {
          accountButtonRef.current?.focus();
        }
        setAccountPosition(null);
      }
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
      <button
        type="submit"
        name="intent"
        value="sign-out"
        className="w-full text-start px-4 py-2.5 text-xs font-semibold text-[var(--danger)] hover:bg-[var(--danger-surface)] transition-colors cursor-pointer"
      >
        {locale === "ar" ? "تسجيل الخروج" : "Sign out"}
      </button>
    </Form>
  );

  return (
    <div className="sf-header-actions">
      {/* Notifications Button */}
      <Link
        to={`/${locale}/notifications`}
        aria-label={notificationsLabel}
        title={notificationsLabel}
        className={`${headerControlClass} relative`}
      >
        <BellIcon className="size-5" />
        {unreadCount > 0 ? (
          <span className="absolute -top-1 -end-1 flex min-w-4 h-4 px-1 items-center justify-center rounded-full bg-[var(--danger)] text-[10px] font-bold text-white shadow-xs leading-none">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </Link>

      {/* Locale Switcher */}
      <Link
        to={switchHref}
        aria-label={switchLocaleLabel}
        title={switchLocaleLabel}
        lang={otherLocale}
        hrefLang={otherLocale}
        className={`${headerControlClass} sf-locale-control`}
      >
        <GlobeIcon className="size-5" />
      </Link>

      {/* Theme Toggle Button */}
      <ThemeToggle label={themeToggleLabel} />

      {/* Wallet Balance Pill */}
      {session && walletPanel ? (
        <Link
          to={`/${locale}/wallet`}
          aria-label={locale === "ar" ? "المحفظة" : "Wallet"}
          className="sf-wallet-control"
        >
          <WalletIcon />
          <bdi dir="ltr">
            {formatPrice(walletPanel.balance, walletPanel.currency, locale)}
          </bdi>
        </Link>
      ) : null}

      {/* Account Menu Popover */}
      <div className="sf-desktop-account">
        {session ? (
          <div className="relative" ref={accountRef}>
            <button
              type="button"
              ref={accountButtonRef}
              aria-expanded={!!accountPosition}
              aria-controls="site-account-menu"
              onClick={() => {
                if (accountPosition) {
                  setAccountPosition(null);
                  return;
                }
                const box = accountButtonRef.current?.getBoundingClientRect();
                if (box) {
                  setAccountPosition({
                    top: box.bottom + 8,
                    locationKey: location.key,
                    right: Math.min(
                      Math.max(16, window.innerWidth - 276),
                      Math.max(16, window.innerWidth - box.right),
                    ),
                  });
                }
              }}
              aria-label={accountMenuLabel}
              className={`${headerControlClass} sf-account-trigger`}
            >
              {session.avatarUrl ? (
                <img
                  src={session.avatarUrl}
                  alt=""
                  className="size-full rounded-full"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <UserIcon />
              )}
            </button>

            {accountPosition ? (
              <div
                id="site-account-menu"
                className="sf-account-menu"
                style={{
                  position: "fixed",
                  top: accountPosition.top,
                  right: accountPosition.right,
                  zIndex: 60,
                }}
              >
                <div className="p-3 border-b border-[var(--line)]">
                  <p className="font-semibold text-sm text-[var(--ink)] truncate">
                    <bdi>{session.displayName || session.email || "Account"}</bdi>
                  </p>
                  {session.email ? (
                    <p className="text-xs text-[var(--ink-muted)] truncate">{session.email}</p>
                  ) : null}
                  <p className="mt-1 text-[11px] text-[var(--ink-faint)]">{signedInAsLabel}</p>
                </div>

                <div className="py-1">
                  {accountItems.map((item) => (
                    <Link
                      key={item.href}
                      to={item.href}
                      onClick={() => setAccountPosition(null)}
                      className="block px-4 py-2 text-xs font-medium text-[var(--ink-soft)] hover:bg-[var(--surface-strong)] hover:text-[var(--ink)] transition-colors"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>

                <div className="border-t border-[var(--line)]">{signOut}</div>
              </div>
            ) : null}
          </div>
        ) : (
          <Link
            to={`/${locale}/login`}
            className={`${headerControlClass} sf-account-trigger`}
            aria-label={locale === "ar" ? "تسجيل الدخول" : "Sign in"}
          >
            <UserIcon />
          </Link>
        )}
      </div>

      {/* Mobile Drawer Trigger Button */}
      <button
        type="button"
        className={`${headerControlClass} sf-drawer-trigger`}
        aria-label={openDrawerLabel}
        onClick={onOpenDrawer}
      >
        <MenuIcon />
      </button>
    </div>
  );
}

export interface HeaderMobileDrawerProps {
  dialogRef: React.RefObject<HTMLDialogElement | null>;
  locale: Locale;
  brandName?: string;
  brandHref?: string;
  brandBadge?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

export function HeaderMobileDrawer({
  dialogRef,
  locale,
  brandName = "GH Store",
  brandHref,
  brandBadge,
  children,
  footer,
}: HeaderMobileDrawerProps) {
  const homeHref = brandHref || `/${locale}`;

  return (
    <dialog
      ref={dialogRef}
      className="sf-drawer"
      aria-label="Navigation menu"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          dialogRef.current?.close();
        }
      }}
    >
      <div className="flex items-center justify-between">
        <Link to={homeHref} className="flex items-center gap-2" onClick={() => dialogRef.current?.close()}>
          <StorefrontBrand name={brandName} />
          {brandBadge}
        </Link>
        <button
          type="button"
          className={headerControlClass}
          onClick={() => dialogRef.current?.close()}
          aria-label="Close menu"
        >
          <CloseIcon />
        </button>
      </div>

      <div className="my-5 border-y border-[var(--line)] py-4">{children}</div>

      {footer}
    </dialog>
  );
}
