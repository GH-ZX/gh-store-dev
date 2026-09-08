import { Form, Link, useLocation } from "react-router";
import { useEffect, useRef } from "react";
import {
  ArrowIcon,
  CableIcon,
  DepositIcon,
  GamepadIcon,
  GlobeIcon,
  GridIcon,
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
  HeaderShell,
  HeaderActions,
  HeaderMobileDrawer,
  ThemeToggle,
  StorefrontBrand,
} from "@/components/layout/header-base";
export { StorefrontBrand, ThemeToggle };
import { DASHBOARD_NAV_GROUPS, isDashboardNavActive } from "@/lib/admin-dashboard/navigation";
import { type Locale } from "@/i18n/config";
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
  showLogo?: boolean;
}

export function AdminHeader({
  locale,
  messages,
  displayName,
  brandName = "GH Store",
  showLogo = false,
}: AdminHeaderProps) {
  const location = useLocation();
  const base = `/${locale}/dashboard`;
  const drawerRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    drawerRef.current?.close();
  }, [location.pathname, location.search]);

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

  const adminBadge = (
    <span className="admin-badge admin-badge-accent text-[11px] font-extrabold uppercase px-2 py-0.5 tracking-wider">
      Admin
    </span>
  );

  const centerBreadcrumb = (
    <div className="hidden md:flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[var(--surface-strong)] border border-[var(--line)] text-xs text-[var(--ink-muted)]">
      <Link to={base} className="hover:text-[var(--ink)] font-medium transition-colors">
        {messages.title}
      </Link>
      <span className="text-[var(--line-strong)] select-none">/</span>
      <span className="font-bold text-[var(--ink)]">{activeTitle}</span>
    </div>
  );

  const accountItems = [
    { href: `/${locale}`, label: locale === "ar" ? "زيارة المتجر" : "View store" },
    { href: base, label: messages.title },
    { href: `${base}/support`, label: messages.nav.support ?? "Support" },
  ];

  const adminSubnav = (
    <div className="sf-categories-wrapper border-t border-[var(--line)]">
      <div className="gh-page">
        <nav
          className="sf-categories-bar admin-horizontal-nav"
          aria-label={messages.title}
        >
          {allNavItems.map(({ key, href, label, Icon, active }) => (
            <Link
              key={key}
              to={href}
              className={`sf-category-pill admin-nav-pill ${active ? "is-active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <Icon className="size-4 shrink-0" />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );

  const drawerContent = (
    <>
      <p className="font-semibold text-base text-[var(--ink)]">
        <bdi>{displayName || "Admin"}</bdi>
      </p>
      <p className="mt-0.5 text-xs text-[var(--ink-muted)]">{messages.signedInAs}</p>

      <div className="my-4 space-y-1">
        {allNavItems.map(({ key, href, label, Icon, active }) => (
          <Link
            key={key}
            to={href}
            onClick={() => drawerRef.current?.close()}
            className={`flex items-center justify-between rounded-xl p-3 text-xs font-semibold transition-colors ${
              active
                ? "bg-[var(--accent)] text-white shadow-xs"
                : "text-[var(--ink-soft)] hover:bg-[var(--surface-strong)] hover:text-[var(--ink)]"
            }`}
            aria-current={active ? "page" : undefined}
          >
            <span className="flex items-center gap-2.5">
              <Icon className="size-4" />
              <span>{label}</span>
            </span>
            <ArrowIcon direction={locale === "ar" ? "start" : "end"} className="size-3 opacity-60" />
          </Link>
        ))}
      </div>
    </>
  );

  const drawerFooter = (
    <div className="mt-6 flex items-center justify-between border-t border-[var(--line)] pt-4">
      <ThemeToggle label={locale === "ar" ? "تبديل المظهر" : "Toggle theme"} />
      <Form method="post" action={`/${locale}`}>
        <button
          type="submit"
          name="intent"
          value="sign-out"
          className="text-xs font-semibold text-[var(--danger)] hover:underline cursor-pointer"
        >
          {locale === "ar" ? "تسجيل الخروج" : "Sign out"}
        </button>
      </Form>
    </div>
  );

  return (
    <HeaderShell
      locale={locale}
      brandName={brandName}
      brandBadge={adminBadge}
      showLogo={showLogo}
      center={centerBreadcrumb}
      actions={
        <HeaderActions
          locale={locale}
          session={{ displayName: displayName || "Admin" }}
          accountItems={accountItems}
          signedInAsLabel={messages.signedInAs}
          accountMenuLabel="Admin menu"
          onOpenDrawer={() => drawerRef.current?.showModal()}
        />
      }
      subnav={adminSubnav}
      drawer={
        <HeaderMobileDrawer
          dialogRef={drawerRef}
          locale={locale}
          brandName={brandName}
          brandBadge={adminBadge}
          showLogo={showLogo}
          footer={drawerFooter}
        >
          {drawerContent}
        </HeaderMobileDrawer>
      }
    />
  );
}
