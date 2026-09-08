import { Form, Link, useLocation } from "react-router";
import { useEffect, useRef, useState } from "react";
import {
  ArrowIcon,
  BellIcon,
  CableIcon,
  CloseIcon,
  DepositIcon,
  GamepadIcon,
  GlobeIcon,
  GridIcon,
  MenuIcon,
  ReceiptIcon,
  ScrollIcon,
  SparkIcon,
  StarIcon,
  SupportIcon,
  SyncIcon,
  UserIcon,
  WalletIcon,
} from "@/components/ui/icons";
import {
  StorefrontBrand,
  ThemeToggle,
} from "@/components/layout/storefront-chrome";
import { DASHBOARD_NAV_GROUPS, isDashboardNavActive } from "@/lib/admin-dashboard/navigation";
import { getLocaleDirection, type Locale } from "@/i18n/config";
import type { AdminMessages } from "@/i18n/messages";

type IconComponent = React.ComponentType<{ className?: string }>;

const PAGE_ICONS: Record<string, IconComponent> = {
  overview: GridIcon,
  orders: ReceiptIcon,
  catalog: GamepadIcon,
  recharges: DepositIcon,
  customers: UserIcon,
  providers: CableIcon,
  sync: SyncIcon,
  website: GlobeIcon,
  appearance: SparkIcon,
  reviews: StarIcon,
  support: SupportIcon,
  payments: WalletIcon,
  operations: ScrollIcon,
};

export interface AdminHeaderProps {
  locale: Locale;
  messages: AdminMessages["shell"];
  displayName?: string;
  brandName?: string;
}

export function AdminHeader({
  locale,
  messages,
  displayName,
  brandName = "GH Store",
}: AdminHeaderProps) {
  const location = useLocation();
  const base = `/${locale}/dashboard`;

  const drawerRef = useRef<HTMLDialogElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [accountPopover, setAccountPosition] = useState<{
    top: number;
    right: number;
    locationKey: string;
  } | null>(null);

  const accountPosition =
    accountPopover?.locationKey === location.key ? accountPopover : null;

  // Close drawer on path change
  useEffect(() => {
    drawerRef.current?.close();
  }, [location.pathname, location.search]);

  // Account popover blur / Escape handlers
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

  // Map all navigation items
  const allNavItems = DASHBOARD_NAV_GROUPS.flatMap((group) =>
    group.items.flatMap((item) => {
      if (!item.href) return [];
      const href = item.href === "/" ? base : `${base}${item.href}`;
      const active = isDashboardNavActive(base, href, location.pathname);
      const label =
        messages.nav[item.key as keyof typeof messages.nav] ?? item.key;
      const Icon = PAGE_ICONS[item.key] ?? GridIcon;
      return [{ key: item.key, href, label, Icon, active, groupKey: group.key }];
    }),
  );

  const activeItem = allNavItems.find((item) => item.active);
  const activeTitle = activeItem?.label ?? messages.title;

  // Language switcher
  const otherLocale: Locale = locale === "ar" ? "en" : "ar";
  const switchHref =
    location.pathname.replace(/^\/(ar|en)(?=\/|$)/, `/${otherLocale}`) +
    location.search +
    location.hash;

  const control = "sf-control";
  const switchLocaleLabel = otherLocale === "en" ? "English" : "العربية";
  const themeToggleLabel = locale === "ar" ? "تبديل المظهر" : "Toggle theme";

  const signOut = (
    <Form method="post" action={`/${locale}`}>
      <input type="hidden" name="intent" value="sign-out" />
      <button
        className="min-h-11 w-full rounded-xl px-3 text-start text-sm text-[var(--danger)] hover:bg-[var(--surface-strong)] transition-colors cursor-pointer"
        type="submit"
      >
        {locale === "ar" ? "تسجيل الخروج" : "Sign out"}
      </button>
    </Form>
  );

  return (
    <header data-site-header className="sf-site-header">
      {/* 1. Main Header Row (Identical to Storefront) */}
      <div className="gh-page sf-header-main">
        {/* Brand Link with Admin Tag */}
        <Link
          to={base}
          className="sf-brand-link flex items-center gap-2.5"
          aria-label={brandName}
        >
          <StorefrontBrand name={brandName} />
          <span className="admin-badge admin-badge-accent text-[11px] font-extrabold uppercase px-2 py-0.5 tracking-wider">
            Admin
          </span>
        </Link>

        {/* Dynamic Section Indicator (Breadcrumb) in Center */}
        <div className="hidden md:flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[var(--surface-strong)] border border-[var(--line)] text-xs text-[var(--ink-muted)]">
          <Link to={base} className="hover:text-[var(--ink)] font-medium transition-colors">
            {messages.title}
          </Link>
          <span className="text-[var(--line-strong)] select-none">/</span>
          <span className="font-bold text-[var(--ink)]">{activeTitle}</span>
        </div>

        {/* Actions Cluster (Identical 44px Controls to Storefront) */}
        <div className="sf-header-actions">
          {/* Quick View Store Link */}
          <Link
            to={`/${locale}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={locale === "ar" ? "زيارة المتجر" : "View store"}
            title={locale === "ar" ? "زيارة المتجر" : "View store"}
            className={`${control} admin-header-store-link`}
          >
            <GamepadIcon className="size-5 text-[var(--accent)]" />
          </Link>

          {/* Notifications Button */}
          <Link
            to={`/${locale}/notifications`}
            aria-label={locale === "ar" ? "الإشعارات" : "Notifications"}
            title={locale === "ar" ? "الإشعارات" : "Notifications"}
            className={`${control} relative`}
          >
            <BellIcon className="size-5" />
          </Link>

          {/* Locale Switcher */}
          <Link
            to={switchHref}
            aria-label={switchLocaleLabel}
            title={switchLocaleLabel}
            lang={otherLocale}
            hrefLang={otherLocale}
            className={`${control} sf-locale-control`}
          >
            <GlobeIcon className="size-5" />
          </Link>

          {/* Theme Toggle Button */}
          <ThemeToggle label={themeToggleLabel} />

          {/* Desktop Account Menu */}
          <div className="sf-desktop-account">
            <div
              className="relative"
              ref={accountRef}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setAccountPosition(null);
                }
              }}
            >
              <button
                type="button"
                ref={accountButtonRef}
                aria-expanded={!!accountPosition}
                aria-controls="admin-account-menu"
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
                aria-label={displayName || "Admin Account"}
                className={`${control} sf-account-trigger`}
              >
                <UserIcon />
              </button>

              {accountPosition ? (
                <div
                  id="admin-account-menu"
                  data-storefront-shell=""
                  dir={getLocaleDirection(locale)}
                  style={{
                    top: accountPosition.top,
                    right: accountPosition.right,
                  }}
                  className="sf-account-popover"
                >
                  <div className="px-3 py-2 border-b border-[var(--line)]">
                    <p className="font-semibold text-sm text-[var(--ink)]">
                      <bdi>{displayName || "Admin"}</bdi>
                    </p>
                    <span className="text-[11px] text-[var(--ink-muted)]">
                      {messages.signedInAs}
                    </span>
                  </div>

                  <div className="py-1">
                    <Link
                      to={`/${locale}`}
                      target="_blank"
                      className="flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm hover:bg-[var(--surface-strong)] text-[var(--ink)]"
                    >
                      <GlobeIcon className="size-4 text-[var(--accent)]" />
                      <span>{locale === "ar" ? "زيارة المتجر" : "View store"}</span>
                    </Link>
                    <Link
                      to={base}
                      className="flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm hover:bg-[var(--surface-strong)] text-[var(--ink)]"
                    >
                      <GridIcon className="size-4" />
                      <span>{messages.title}</span>
                    </Link>
                  </div>

                  <div className="pt-1 border-t border-[var(--line)]">
                    {signOut}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {/* Mobile Menu Trigger Button */}
          <button
            type="button"
            className={`${control} sf-menu-trigger`}
            aria-label={drawerOpen ? "Close menu" : "Open menu"}
            aria-expanded={drawerOpen}
            aria-controls="admin-mobile-menu"
            onClick={() => {
              if (drawerOpen) drawerRef.current?.close();
              else {
                drawerRef.current?.showModal();
                setDrawerOpen(true);
              }
            }}
          >
            <MenuIcon />
          </button>
        </div>
      </div>

      {/* 2. Section Navigation Bar (Identical Category Bar Geometry & Styles) */}
      <div className="sf-category-bar">
        <nav
          className="gh-page sf-category-nav"
          aria-label={messages.navLabel}
        >
          {allNavItems.map(({ href, label, Icon, active }) => (
            <Link
              key={href}
              to={href}
              className={`sf-category-link${active ? " is-active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <Icon className="size-4.5 shrink-0" />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
      </div>

      {/* 3. Mobile Drawer (Identical Native Dialog & Styling to Storefront) */}
      <dialog
        id="admin-mobile-menu"
        onClose={() => setDrawerOpen(false)}
        ref={drawerRef}
        dir={getLocaleDirection(locale)}
        className="sf-mobile-drawer"
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            const box = event.currentTarget.getBoundingClientRect();
            if (event.clientX < box.left || event.clientX > box.right)
              drawerRef.current?.close();
          }
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StorefrontBrand name={brandName} />
            <span className="admin-badge admin-badge-accent text-[11px] font-bold py-0.5 px-2">
              Admin
            </span>
          </div>
          <button
            type="button"
            className={control}
            onClick={() => drawerRef.current?.close()}
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="my-5 border-y border-[var(--line)] py-4">
          <p className="font-semibold text-base text-[var(--ink)]">
            <bdi>{displayName || "Admin"}</bdi>
          </p>
          <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
            {messages.signedInAs}
          </p>
          <Link
            to={`/${locale}`}
            target="_blank"
            className="mt-3 flex items-center justify-between rounded-xl bg-[var(--surface-strong)] p-3 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--surface-inset)]"
          >
            <span className="flex items-center gap-2">
              <GlobeIcon className="size-4 text-[var(--accent)]" />
              <span>{locale === "ar" ? "زيارة المتجر" : "View store"}</span>
            </span>
            <ArrowIcon direction={locale === "ar" ? "start" : "end"} className="size-3" />
          </Link>
        </div>

        {/* Dashboard Nav Items in Drawer */}
        <nav aria-label={messages.navLabel} className="grid gap-1">
          {allNavItems.map(({ href, label, Icon, active }) => (
            <Link
              key={href}
              to={href}
              onClick={() => drawerRef.current?.close()}
              className={`rounded-xl px-3 py-3 font-medium flex items-center gap-3 transition-colors ${
                active
                  ? "bg-[var(--surface-strong)] text-[var(--accent)]"
                  : "hover:bg-[var(--surface)] text-[var(--ink-soft)] hover:text-[var(--ink)]"
              }`}
            >
              <Icon className="size-4.5 shrink-0" />
              <span className="text-sm">{label}</span>
            </Link>
          ))}
        </nav>

        <div className="mt-6 flex items-center justify-between border-t border-[var(--line)] pt-4">
          <ThemeToggle label={themeToggleLabel} />
          {signOut}
        </div>
      </dialog>
    </header>
  );
}
