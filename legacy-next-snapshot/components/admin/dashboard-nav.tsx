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
 * Dashboard header navigation.
 *
 * The dashboard is a work surface, not a second website header, so every
 * destination is a plain button in one row. There is no disclosure menu: on
 * any screen the row scrolls horizontally, so a thumb swipes between sections
 * instead of reaching for a dropdown. The current section stays marked, and
 * the row turns transparent where it meets the edges so it is obvious more
 * items are waiting off-screen.
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
      return [{ ...item, href }];
    }),
  );

  const activeHref = pages.find((page) => isDashboardNavActive(base, page.href, pathname))?.href;

  return (
    <nav aria-label={messages.navLabel} className="sticky top-[4.75rem] z-30 sm:top-[5.25rem]">
      <div className="relative flex items-center rounded-[var(--radius-card)] border border-[var(--line)] bg-[color-mix(in_srgb,var(--shell)_94%,transparent)] shadow-[var(--elevation-1)] backdrop-blur-xl">
        <div
          aria-label={messages.navLabel}
          className="flex min-h-14 max-w-full items-center gap-0.5 overflow-x-auto px-2 sm:px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {pages.map((page) => {
            const Icon = PAGE_ICONS[page.key] ?? GridIcon;
            const label =
              messages.nav[page.key as keyof AdminMessages["shell"]["nav"]] ?? page.key;
            const active = page.href === activeHref;

            return (
              <Link
                key={page.key}
                href={page.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-10 shrink-0 items-center gap-2 rounded-full px-3 text-sm transition-colors duration-[var(--duration)]",
                  active
                    ? "bg-[var(--accent)] font-semibold text-[var(--accent-ink)]"
                    : "text-[var(--ink-soft)] hover:bg-[var(--surface)] hover:text-[var(--ink)]",
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span className="whitespace-nowrap">{label}</span>
              </Link>
            );
          })}
        </div>

        {/* Edge fades so a partial button peeking off-screen reads as "more",
            not a cut-off. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute start-0 top-0 h-full w-6 rounded-s-[var(--radius-card)] bg-[linear-gradient(to_left,transparent,color-mix(in_srgb,var(--shell)_94%,transparent))]"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-0 end-0 h-full w-6 rounded-e-[var(--radius-card)] bg-[linear-gradient(to_right,transparent,color-mix(in_srgb,var(--shell)_94%,transparent))]"
        />
      </div>
    </nav>
  );
}