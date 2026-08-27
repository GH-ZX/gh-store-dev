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
 * Simple dashboard header navigation.
 *
 * The dashboard is a work surface, not a second website header. It keeps one
 * compact current-page bar visible and puts every destination in a native
 * disclosure menu. This works on small screens, supports keyboard navigation,
 * and has no hover state or client-side menu state to get out of sync.
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
  const pages = DASHBOARD_NAV_GROUPS.flatMap((group) =>
    group.items.flatMap((item) => {
      if (!item.href) return [];
      const href = item.href === "/" ? base : `${base}${item.href}`;
      return [{ ...item, href, group: group.key }];
    }),
  );
  const current = pages.find((page) => isDashboardNavActive(base, page.href, pathname)) ?? pages[0];
  const CurrentIcon = current ? PAGE_ICONS[current.key] ?? GridIcon : GridIcon;
  const currentLabel = current
    ? messages.nav[current.key as keyof AdminMessages["shell"]["nav"]] ?? current.key
    : messages.title;

  return (
    <nav aria-label={messages.navLabel} className="sticky top-[4.75rem] z-30 sm:top-[5.25rem]">
      <div className="flex min-h-14 items-center gap-2 rounded-[var(--radius-card)] border border-[var(--line)] bg-[color-mix(in_srgb,var(--shell)_94%,transparent)] px-3 shadow-[var(--elevation-1)] backdrop-blur-xl sm:px-4">
        <Link
          href={base}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-control)] px-1 py-2 text-sm font-semibold text-[var(--ink)]"
        >
          <GridIcon className="size-4 shrink-0 text-[var(--accent)]" />
          <span className="truncate">{messages.title}</span>
        </Link>

        <span className="hidden h-5 w-px bg-[var(--line)] sm:block" aria-hidden="true" />
        <span className="hidden min-w-0 items-center gap-2 text-sm text-[var(--ink-muted)] sm:flex">
          <CurrentIcon className="size-4 shrink-0" />
          <span className="max-w-48 truncate">{currentLabel}</span>
        </span>

        <details className="relative shrink-0">
          <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--ink-soft)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--ink)] [&::-webkit-details-marker]:hidden">
            <span className="sm:hidden">{currentLabel}</span>
            <span className="hidden sm:inline">{messages.navLabel}</span>
            <span aria-hidden="true" className="text-xs text-[var(--ink-muted)]">⌄</span>
          </summary>

          <div className="absolute end-0 top-12 z-50 grid max-h-[min(70vh,34rem)] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface)] p-2 shadow-[var(--elevation-3)]">
            {DASHBOARD_NAV_GROUPS.map((group) => {
              const groupLabel =
                (messages.groups as Record<string, string>)[group.key] ?? group.key;

              return (
                <div key={group.key} className="not-first:mt-2 not-first:border-t not-first:border-[var(--line)] not-first:pt-2">
                  <p className="px-3 py-1.5 text-[0.6875rem] font-semibold tracking-[0.12em] text-[var(--ink-faint)] uppercase">
                    {groupLabel}
                  </p>
                  <div className="grid gap-0.5">
                    {group.items.map((item) => {
                      if (!item.href) return null;
                      const href = item.href === "/" ? base : `${base}${item.href}`;
                      const active = isDashboardNavActive(base, href, pathname);
                      const Icon = PAGE_ICONS[item.key] ?? GridIcon;
                      const label = messages.nav[item.key as keyof AdminMessages["shell"]["nav"]] ?? item.key;

                      return (
                        <Link
                          key={item.key}
                          href={href}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "flex min-h-10 items-center gap-3 rounded-[var(--radius-control)] px-3 text-sm transition-colors",
                            active
                              ? "bg-[var(--accent)] font-semibold text-[var(--accent-ink)]"
                              : "text-[var(--ink-soft)] hover:bg-[var(--shell)] hover:text-[var(--ink)]",
                          )}
                        >
                          <Icon className="size-4 shrink-0" />
                          <span className="min-w-0 flex-1 truncate">{label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      </div>
    </nav>
  );
}
