"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactElement, type SVGProps } from "react";
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
 * Five buttons, no dropdown overlay.
 *
 * Desktop: five equal buttons in one row. The active group's pages appear as
 * a second, quiet row directly underneath — no overlay, no hover, no scroll.
 * Mobile: the same five buttons wrap, and the active group's pages wrap as a
 * second row. Every tap is a real navigation, nothing hides behind a hover
 * that fails on a phone. No logout or "back to store" — those live in the
 * site header, not the working surface.
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
  const [activeGroup, setActiveGroup] = useState<string | null>(() => {
    for (const g of DASHBOARD_NAV_GROUPS) {
      for (const it of g.items) {
        if (!it.href) continue;
        const href = it.href === "/" ? base : `${base}${it.href}`;
        if (isDashboardNavActive(base, href, pathname)) return g.key;
      }
    }
    return DASHBOARD_NAV_GROUPS[0]?.key ?? null;
  });

  function isActive(href: string): boolean {
    return isDashboardNavActive(base, href, pathname);
  }

  const pathnameGroup = DASHBOARD_NAV_GROUPS.find((group) =>
    group.items.some((item) => {
      if (!item.href) return false;
      const href = item.href === "/" ? base : `${base}${item.href}`;
      return isDashboardNavActive(base, href, pathname);
    }),
  );
  const active = pathnameGroup ?? DASHBOARD_NAV_GROUPS.find((g) => g.key === activeGroup) ?? DASHBOARD_NAV_GROUPS[0];
  const activeItems = (active?.items ?? [])
    .filter((it) => it.href)
    .map((it) => ({
      ...it,
      href: it.href === "/" ? base : `${base}${it.href}`,
      label: messages.nav[it.key as keyof AdminMessages["shell"]["nav"]] ?? it.key,
    }));

  const isSingleItemGroup = activeItems.length === 1;

  return (
    <nav aria-label={messages.navLabel} className="sticky top-[4.75rem] z-30 sm:top-[5.25rem]">
      <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[color-mix(in_srgb,var(--shell)_88%,transparent)] p-2 shadow-[var(--elevation-2)] backdrop-blur-xl">
        {/* Five top-level buttons */}
        <div className="grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap sm:gap-1.5">
          {DASHBOARD_NAV_GROUPS.map((group) => {
            const label = (messages.groups as Record<string, string>)[group.key] ?? group.key;
            const Icon = GROUP_ICONS[group.key] ?? GridIcon;
            const groupActive = group.key === activeGroup;
            const hasItems = group.items.some((it) => it.href);
            // Groups with a single page act as a direct link.
            const single = group.items.length === 1 && group.items[0]?.href ? group.items[0] : null;
            if (single?.href) {
              const href = single.href === "/" ? base : `${base}${single.href}`;
              const current = isActive(href);
              return (
                <Link
                  key={group.key}
                  href={href}
                  prefetch={false}
                  aria-current={current ? "page" : undefined}
                  onClick={() => setActiveGroup(group.key)}
                  className={cn(
                    "inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-control)] px-3 py-2.5 text-sm font-medium transition-colors sm:justify-start",
                    current
                      ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                      : "bg-[var(--surface)] text-[var(--ink-muted)] hover:text-[var(--ink)]",
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="whitespace-nowrap">{label}</span>
                </Link>
              );
            }
            return (
              <button
                key={group.key}
                type="button"
                aria-pressed={groupActive}
                onClick={() => setActiveGroup(group.key)}
                className={cn(
                  "inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-control)] px-3 py-2.5 text-sm font-medium transition-colors sm:justify-start",
                  groupActive
                    ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                    : hasItems
                      ? "bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--surface)]"
                      : "text-[var(--ink-muted)]",
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span className="whitespace-nowrap">{label}</span>
                <span className={cn("ms-1 text-xs opacity-60", groupActive && "opacity-80")}>
                  {group.items.filter((it) => it.href).length}
                </span>
              </button>
            );
          })}
        </div>

        {/* Second row: the active group's pages. No overlay, no scroll, wraps on mobile. */}
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

        {/* Single-item group hint: still show its one page as a quiet pill so the second row is not empty. */}
        {active && isSingleItemGroup ? (
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
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium sm:text-sm",
                    current ? "bg-[var(--ink)] text-[var(--shell)]" : "bg-[var(--surface)] text-[var(--ink-muted)]",
                  )}
                >
                  <Icon className="size-3.5" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ) : null}
      </div>
    </nav>
  );
}
