"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactElement, SVGProps } from "react";
import { Badge } from "@/components/ui/badge";
import {
  CableIcon,
  DepositIcon,
  GamepadIcon,
  GearIcon,
  GlobeIcon,
  GridIcon,
  PackageIcon,
  ReceiptIcon,
  ScrollIcon,
  StarIcon,
  SupportIcon,
  UserIcon,
  WalletIcon,
  BoltIcon,
} from "@/components/ui/icons";
import { DASHBOARD_NAV_GROUPS, isDashboardNavActive } from "@/lib/admin-dashboard/navigation";
import type { Locale } from "@/i18n/config";
import type { AdminMessages } from "@/i18n/messages";
import { cn } from "@/lib/cn";

type IconType = (props: SVGProps<SVGSVGElement>) => ReactElement;

const GROUP_ICONS: Record<string, IconType> = {
  overview: GridIcon,
  operations: BoltIcon,
  catalog: PackageIcon,
  settings: GearIcon,
};

const PAGE_ICONS: Record<string, IconType> = {
  overview: GridIcon,
  games: GamepadIcon,
  website: GlobeIcon,
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
 * Dashboard navigation, one definition two shapes.
 *
 * `variant === "sidebar"` is the desktop group-and-list on the left; below `lg`
 * that sidebar is hidden and `variant === "mobile"` renders a sticky bar of the
 * four groups under the site header, with a segmented control beneath showing
 * the active group's pages. Both read the same {@link DASHBOARD_NAV_GROUPS}, so
 * a reorder or a new page shows up in both places.
 */
export type DashboardNavProps = {
  locale: Locale;
  messages: AdminMessages["shell"];
  variant: "sidebar" | "mobile";
};

export function DashboardNav({ locale, messages, variant }: DashboardNavProps) {
  const pathname = usePathname() ?? "";
  const base = `/${locale}/dashboard`;
  const groups = DASHBOARD_NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.map((item) => ({
      ...item,
      href: item.href === "/" ? base : item.href ? `${base}${item.href}` : undefined,
    })),
  }));

  function isActive(href: string): boolean {
    return isDashboardNavActive(base, href, pathname);
  }

  if (variant === "mobile") {
    const activeGroup = groups.find((group) => group.items.some((item) => item.href && isActive(item.href)));

    return (
      <div className="lg:hidden">
        <nav aria-label={messages.navLabel} className="sticky top-[4.75rem] z-30 -mx-2 px-2 sm:top-[5.25rem]">
          <div className="grid grid-cols-4 gap-1.5 rounded-[var(--radius-card)] border border-[var(--line)] bg-[color-mix(in_srgb,var(--shell)_88%,transparent)] p-1.5 shadow-[var(--elevation-2)] backdrop-blur-xl">
            {groups.map((group) => {
              const Icon = GROUP_ICONS[group.key] ?? GridIcon;
              const isGroupActive = group === activeGroup;
              const hasHref = group.items.some((item) => item.href);

              return (
                <Link
                  key={group.key}
                  href={hasHref ? (group.items.find((item) => item.href)?.href ?? base) : base}
                  aria-current={isGroupActive ? "page" : undefined}
                  className={cn(
                    "flex min-w-0 flex-col items-center justify-center gap-1 rounded-[var(--radius-control)] px-1 py-2 text-center transition-colors duration-[var(--duration)]",
                    isGroupActive
                      ? "bg-[var(--surface-strong)] text-[var(--ink)]"
                      : "text-[var(--ink-muted)] hover:text-[var(--ink)]",
                  )}
                >
                  <Icon className="size-5 shrink-0" />
                  <span className="max-w-full truncate text-[0.6875rem] font-semibold leading-none">
                    {messages.groups[group.key as keyof AdminMessages["shell"]["groups"]]}
                  </span>
                </Link>
              );
            })}
          </div>

          {activeGroup && activeGroup.items.some((item) => item.href) ? (
            <div
              role="tablist"
              aria-label={messages.groups[activeGroup.key as keyof AdminMessages["shell"]["groups"]]}
              className="mt-2 grid gap-1 rounded-[var(--radius-card)] border border-[var(--line)] bg-[color-mix(in_srgb,var(--shell)_88%,transparent)] p-1 shadow-[var(--elevation-1)] backdrop-blur-xl"
              style={{ gridTemplateColumns: `repeat(${activeGroup.items.filter((item) => item.href).length}, minmax(0, 1fr))` }}
            >
              {activeGroup.items.map((item) => {
                if (!item.href) {
                  return null;
                }

                const Icon = PAGE_ICONS[item.key] ?? GridIcon;
                const current = isActive(item.href);

                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    role="tab"
                    aria-selected={current}
                    aria-current={current ? "page" : undefined}
                    className={cn(
                      "flex min-w-0 flex-col items-center justify-center gap-1 rounded-[var(--radius-control)] px-1 py-2 text-center transition-colors duration-[var(--duration)]",
                      current
                        ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                        : "text-[var(--ink-muted)] hover:text-[var(--ink)]",
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span className="max-w-full truncate text-[0.625rem] font-semibold leading-none">
                      {messages.nav[item.key as keyof AdminMessages["shell"]["nav"]]}
                    </span>
                  </Link>
                );
              })}
            </div>
          ) : null}
        </nav>
      </div>
    );
  }

  return (
    <nav aria-label={messages.navLabel} className="grid gap-6">
      {groups.map((group) => (
        <div key={group.key}>
          <h2 className="px-3 text-[0.6875rem] font-semibold tracking-[0.14em] text-[var(--ink-faint)] uppercase">
            {messages.groups[group.key as keyof AdminMessages["shell"]["groups"]]}
          </h2>
          <ul className="mt-2 grid gap-0.5">
            {group.items.map((item) => {
              const label = messages.nav[item.key as keyof AdminMessages["shell"]["nav"]];

              if (!item.href) {
                return (
                  <li
                    key={item.key}
                    className="flex items-center justify-between gap-2 rounded-[var(--radius-control)] px-3 py-2.5 text-sm text-[var(--ink-faint)]"
                  >
                    <span>{label}</span>
                    <Badge tone="neutral" className="shrink-0 text-[0.625rem]">
                      {messages.comingSoon}
                    </Badge>
                  </li>
                );
              }

              return (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    aria-current={isActive(item.href) ? "page" : undefined}
                    className={cn(
                      "block rounded-[var(--radius-control)] px-3 py-2.5 text-sm transition-colors duration-[var(--duration)]",
                      isActive(item.href)
                        ? "bg-[var(--surface-strong)] font-semibold text-[var(--ink)]"
                        : "text-[var(--ink-soft)] hover:bg-[var(--shell)] hover:text-[var(--ink)]",
                    )}
                  >
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}