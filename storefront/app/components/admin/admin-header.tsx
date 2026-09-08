import { Link, useLocation } from "react-router";
import {
  ArrowIcon,
  GlobeIcon,
  MenuIcon,
  MoonIcon,
  SunIcon,
  UserIcon,
} from "@/components/ui/icons";
import { DASHBOARD_NAV_GROUPS, isDashboardNavActive } from "@/lib/admin-dashboard/navigation";
import type { Locale } from "@/i18n/config";
import type { AdminMessages } from "@/i18n/messages";

export interface AdminHeaderProps {
  locale: Locale;
  messages: AdminMessages["shell"];
  displayName?: string;
  onOpenMobile: () => void;
}

export function AdminHeader({
  locale,
  messages,
  displayName,
  onOpenMobile,
}: AdminHeaderProps) {
  const location = useLocation();
  const base = `/${locale}/dashboard`;

  // Determine current active section title
  let activeTitle = messages.title;
  for (const group of DASHBOARD_NAV_GROUPS) {
    for (const item of group.items) {
      if (!item.href) continue;
      const href = item.href === "/" ? base : `${base}${item.href}`;
      if (isDashboardNavActive(base, href, location.pathname)) {
        activeTitle = messages.nav[item.key as keyof typeof messages.nav] ?? item.key;
        break;
      }
    }
  }

  // Locale switcher target
  const otherLocale: Locale = locale === "ar" ? "en" : "ar";
  const switchHref =
    location.pathname.replace(/^\/(ar|en)(?=\/|$)/, `/${otherLocale}`) +
    location.search +
    location.hash;

  const themeToggleLabel =
    locale === "ar" ? "تبديل المظهر" : "Toggle theme";
  const viewStoreLabel = locale === "ar" ? "زيارة المتجر" : "View store";
  const switchLocaleLabel = otherLocale === "en" ? "English" : "العربية";

  return (
    <header className="admin-header">
      {/* Left / Start: Mobile Menu Toggle & Breadcrumbs */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobile}
          className="lg:hidden p-2 -ms-2 rounded-[var(--radius-control)] text-[var(--ink-soft)] hover:text-[var(--ink)] hover:bg-[var(--surface-strong)] transition-colors cursor-pointer"
          aria-label={messages.navLabel}
        >
          <MenuIcon className="size-5" />
        </button>

        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm min-w-0">
          <Link
            to={base}
            className="text-[var(--ink-muted)] hover:text-[var(--ink)] font-medium transition-colors shrink-0"
          >
            {messages.title}
          </Link>
          <span className="text-[var(--line-strong)] select-none">/</span>
          <span className="font-semibold text-[var(--ink)] truncate">
            {activeTitle}
          </span>
        </nav>
      </div>

      {/* Right / End: Actions & Profile */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Quick View Store */}
        <Link
          to={`/${locale}`}
          target="_blank"
          rel="noopener noreferrer"
          className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-control)] text-xs font-medium border border-[var(--line)] bg-[var(--surface-strong)] text-[var(--ink-soft)] hover:text-[var(--ink)] hover:border-[var(--line-strong)] transition-colors"
        >
          <GlobeIcon className="size-3.5 text-[var(--accent)]" />
          <span>{viewStoreLabel}</span>
          <ArrowIcon
            direction={locale === "ar" ? "start" : "end"}
            className="size-3 opacity-60"
          />
        </Link>

        {/* Locale Switcher */}
        <Link
          to={switchHref}
          aria-label={switchLocaleLabel}
          className="inline-flex items-center justify-center h-8 px-2.5 rounded-[var(--radius-control)] text-xs font-semibold border border-[var(--line)] bg-[var(--surface)] text-[var(--ink-soft)] hover:text-[var(--ink)] hover:bg-[var(--surface-strong)] transition-colors"
        >
          {otherLocale === "en" ? "EN" : "ع"}
        </Link>

        {/* Theme Toggle */}
        <button
          type="button"
          onClick={() => {
            const next =
              document.documentElement.dataset.theme === "light" ? "dark" : "light";
            document.documentElement.dataset.theme = next;
            try {
              localStorage.setItem("gh-store-theme", next);
            } catch {}
          }}
          aria-label={themeToggleLabel}
          className="inline-flex items-center justify-center size-8 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] text-[var(--ink-soft)] hover:text-[var(--ink)] hover:bg-[var(--surface-strong)] transition-colors cursor-pointer"
        >
          <SunIcon className="size-4 text-[var(--warning)] gh-only-dark" />
          <MoonIcon className="size-4 text-[var(--accent)] gh-only-light" />
        </button>

        {/* User Identity Chip */}
        <div className="flex items-center gap-2 ps-1">
          <div className="size-7 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center font-bold text-xs border border-[var(--accent-line)]">
            {displayName ? displayName.charAt(0).toUpperCase() : <UserIcon className="size-3.5" />}
          </div>
          <span className="hidden md:block text-xs font-medium text-[var(--ink)] truncate max-w-[120px]">
            {displayName || "Admin"}
          </span>
        </div>
      </div>
    </header>
  );
}
