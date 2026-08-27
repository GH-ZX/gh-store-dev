"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
} from "@/components/ui/icons";
import { DASHBOARD_NAV_GROUPS, isDashboardNavActive } from "@/lib/admin-dashboard/navigation";
import type { Locale } from "@/i18n/config";
import type { AdminMessages } from "@/i18n/messages";
import { cn } from "@/lib/cn";

type IconType = (props: SVGProps<SVGSVGElement>) => ReactElement;

const GROUP_ICONS: Record<string, IconType> = {
  overview: GridIcon,
  sales: ReceiptIcon,
  people: UserIcon,
  storefront: GamepadIcon,
  system: CableIcon,
};

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

/**
 * A persistent, link-first navigation for the admin workspace.
 *
 * Every group is a real link to its first page; the current group's pages appear
 * in a second row. Nothing depends on hover, hidden dropdowns, or client-only
 * state, so direct links and refreshes always render the right navigation.
 */
export function DashboardNav({
  locale,
  messages,
}: {
  locale: Locale;
  messages: AdminMessages["shell"];
}) {
  const pathname = usePathname() ?? "";
  const base = `/${locale}/dashboard`;
  function isActive(href: string): boolean {
    return isDashboardNavActive(base, href, pathname);
  }

  const active = DASHBOARD_NAV_GROUPS.find((group) =>
    group.items.some((item) => {
      if (!item.href) return false;
      const href = item.href === "/" ? base : `${base}${item.href}`;
      return isDashboardNavActive(base, href, pathname);
    }),
  ) ?? DASHBOARD_NAV_GROUPS[0];
  const activeItems = (active?.items ?? [])
    .filter((it) => it.href)
    .map((it) => ({
      ...it,
      href: it.href === "/" ? base : `${base}${it.href}`,
      label: messages.nav[it.key as keyof AdminMessages["shell"]["nav"]] ?? it.key,
    }));

  return (
    <nav aria-label={messages.navLabel} className="sticky top-[4.75rem] z-30 sm:top-[5.25rem]">
      <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[color-mix(in_srgb,var(--shell)_88%,transparent)] p-2 shadow-[var(--elevation-2)] backdrop-blur-xl">
        {/* Five top-level buttons */}
        <div className="grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap sm:gap-1.5">
          {DASHBOARD_NAV_GROUPS.map((group) => {
            const label = (messages.groups as Record<string, string>)[group.key] ?? group.key;
            const Icon = GROUP_ICONS[group.key] ?? GridIcon;
            const groupActive = group.key === active?.key;
            const firstItem = group.items.find((item) => item.href);
            if (!firstItem?.href) return null;
            const href = firstItem.href === "/" ? base : `${base}${firstItem.href}`;
            return (
              <Link
                key={group.key}
                href={href}
                prefetch={false}
                aria-current={groupActive ? "page" : undefined}
                className={cn(
                  "inline-flex min-w-0 items-center justify-center gap-2 rounded-[var(--radius-control)] px-3 py-2.5 text-sm font-semibold transition-colors sm:flex-1 sm:justify-center",
                  groupActive
                    ? "bg-[var(--accent)] text-[var(--accent-ink)] shadow-[var(--elevation-1)]"
                    : "bg-[var(--surface)] text-[var(--ink-soft)] hover:bg-[var(--line)] hover:text-[var(--ink)]",
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span className="truncate">{label}</span>
                <span className={cn("text-xs tabular-nums opacity-60", groupActive && "opacity-80")}>
                  {group.items.filter((it) => it.href).length}
                </span>
              </Link>
            );
          })}
        </div>

        {/* Second row: the active group's pages. It wraps instead of scrolling on narrow screens. */}
        {active && activeItems.length > 1 ? (
          <div className="mt-2 flex flex-wrap gap-1.5 border-t border-[var(--line)] pt-2">
            {activeItems.map((item) => {
              const Icon = PAGE_ICONS[item.key] ?? GridIcon;
              const current = isActive(item.href);
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  prefetch={false}
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm",
                    current
                      ? "bg-[var(--ink)] text-[var(--shell)]"
                      : "bg-[var(--surface)] text-[var(--ink-muted)] hover:bg-[var(--line)] hover:text-[var(--ink)]",
                  )}
                >
                  <Icon className="size-3.5 shrink-0" />
                  <span className="whitespace-nowrap">{item.label}</span>
                </Link>
              );
            })}
          </div>
        ) : null}

      </div>
    </nav>
  );
}
