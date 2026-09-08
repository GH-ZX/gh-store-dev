import { Form, Link, useLocation } from "react-router";
import type { ReactElement, SVGProps } from "react";
import {
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
  ArrowIcon,
} from "@/components/ui/icons";
import { DASHBOARD_NAV_GROUPS, isDashboardNavActive } from "@/lib/admin-dashboard/navigation";
import type { Locale } from "@/i18n/config";
import type { AdminMessages } from "@/i18n/messages";
import { cn } from "@/lib/cn";

type IconType = (props: SVGProps<SVGSVGElement>) => ReactElement;

const PAGE_ICONS: Record<string, IconType> = {
  overview: GridIcon,
  catalog: GamepadIcon,
  sync: SyncIcon,
  website: GlobeIcon,
  appearance: SparkIcon,
  reviews: StarIcon,
  orders: ReceiptIcon,
  recharges: DepositIcon,
  payments: WalletIcon,
  customers: UserIcon,
  support: SupportIcon,
  providers: CableIcon,
  operations: ScrollIcon,
};

export interface AdminSidebarProps {
  locale: Locale;
  messages: AdminMessages["shell"];
  displayName?: string;
  onNavigate?: () => void;
  className?: string;
}

export function AdminSidebar({
  locale,
  messages,
  displayName,
  onNavigate,
  className,
}: AdminSidebarProps) {
  const { pathname } = useLocation();
  const base = `/${locale}/dashboard`;

  const viewStoreLabel = locale === "ar" ? "زيارة المتجر" : "View store";
  const signOutLabel = locale === "ar" ? "تسجيل الخروج" : "Sign out";
  const adminBadge = locale === "ar" ? "الإدارة" : "Admin";

  return (
    <aside
      className={cn(
        "flex h-full flex-col bg-[var(--surface)] text-[var(--ink)] select-none",
        className,
      )}
      aria-label={messages.navLabel}
    >
      {/* Brand Header */}
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-[var(--line)] px-5">
        <Link
          to={base}
          onClick={onNavigate}
          className="flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded-lg p-1"
        >
          <img
            src="/gh-store-logo-mark.png"
            alt="GH Store"
            className="size-8 shrink-0 rounded-lg object-contain"
          />
          <div className="flex flex-col">
            <span className="font-bold text-sm tracking-tight text-[var(--ink)] leading-none">
              GH Store
            </span>
            <span className="text-[11px] font-medium text-[var(--ink-muted)] mt-1 leading-none">
              {displayName || messages.title}
            </span>
          </div>
        </Link>
        <span className="admin-badge admin-badge-accent text-[11px] px-2 py-0.5">
          {adminBadge}
        </span>
      </div>

      {/* Nav Groups Container */}
      <nav
        className="flex-1 overflow-y-auto px-3 py-4 space-y-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label={messages.navLabel}
      >
        {DASHBOARD_NAV_GROUPS.map((group) => {
          const groupTitle =
            messages.groups[group.key as keyof typeof messages.groups] ?? group.key;

          return (
            <div key={group.key} className="space-y-1">
              <div className="px-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-[var(--ink-muted)]">
                {groupTitle}
              </div>

              <div className="space-y-0.5">
                {group.items.map((item) => {
                  if (!item.href) return null;
                  const href = item.href === "/" ? base : `${base}${item.href}`;
                  const active = isDashboardNavActive(base, href, pathname);
                  const Icon = PAGE_ICONS[item.key] ?? GridIcon;
                  const label =
                    messages.nav[item.key as keyof typeof messages.nav] ?? item.key;

                  return (
                    <Link
                      key={item.key}
                      to={href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-[var(--radius-control)] px-3 py-2 text-sm font-medium transition-colors duration-150",
                        active
                          ? "bg-[var(--accent-soft)] text-[var(--accent)] font-semibold shadow-xs"
                          : "text-[var(--ink-soft)] hover:bg-[var(--surface-strong)] hover:text-[var(--ink)]",
                      )}
                    >
                      {active ? (
                        <span
                          aria-hidden="true"
                          className="absolute inset-y-1.5 start-0 w-1 rounded-full bg-[var(--accent)]"
                        />
                      ) : null}
                      <Icon
                        className={cn(
                          "size-4 shrink-0 transition-colors",
                          active
                            ? "text-[var(--accent)]"
                            : "text-[var(--ink-muted)] group-hover:text-[var(--ink)]",
                        )}
                      />
                      <span className="truncate">{label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Footer Utilities */}
      <div className="shrink-0 border-t border-[var(--line)] p-3 space-y-1 bg-[var(--surface-inset)]">
        <Link
          to={`/${locale}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between rounded-[var(--radius-control)] px-3 py-2 text-xs font-medium text-[var(--ink-soft)] hover:bg-[var(--surface-strong)] hover:text-[var(--ink)] transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <GlobeIcon className="size-4 text-[var(--ink-muted)]" />
            <span>{viewStoreLabel}</span>
          </div>
          <ArrowIcon
            direction={locale === "ar" ? "start" : "end"}
            className="size-3.5 text-[var(--ink-muted)]"
          />
        </Link>

        <Form method="post" action={`/${locale}`}>
          <input type="hidden" name="intent" value="sign-out" />
          <button
            type="submit"
            className="flex w-full items-center gap-2.5 rounded-[var(--radius-control)] px-3 py-2 text-xs font-medium text-[var(--danger)] hover:bg-[var(--danger-surface)] transition-colors cursor-pointer"
          >
            <span className="size-2 rounded-full bg-[var(--danger)]" />
            <span>{signOutLabel}</span>
          </button>
        </Form>
      </div>
    </aside>
  );
}
