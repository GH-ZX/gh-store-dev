"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactElement, SVGProps } from "react";
import { Button } from "@/components/ui/button";
import {
  CableIcon,
  ChevronIcon,
  DepositIcon,
  GamepadIcon,
  GlobeIcon,
  GridIcon,
  ReceiptIcon,
  ScrollIcon,
  SparkIcon,
  StarIcon,
  SupportIcon,
  UserIcon,
  WalletIcon,
} from "@/components/ui/icons";
import { signOutAction } from "@/lib/auth/actions";
import { DASHBOARD_NAV_GROUPS, isDashboardNavActive } from "@/lib/admin-dashboard/navigation";
import type { Locale } from "@/i18n/config";
import type { AdminMessages } from "@/i18n/messages";
import { cn } from "@/lib/cn";

type IconType = (props: SVGProps<SVGSVGElement>) => ReactElement;

const PAGE_ICONS: Record<string, IconType> = {
  overview: GridIcon,
  games: GamepadIcon,
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
 * Dashboard navigation, one bar everywhere.
 *
 * A single horizontally scrollable row of every reachable page — icon plus
 * label, exactly like the old mobile shape — sticky under the site header on
 * phones and desktops alike. The store link and sign-out stay pinned at the
 * end of the bar so they never scroll away.
 */
export function DashboardNav({
  locale,
  messages,
  signOutLabel,
}: {
  locale: Locale;
  messages: AdminMessages["shell"];
  signOutLabel: string;
}) {
  const pathname = usePathname() ?? "";
  const base = `/${locale}/dashboard`;
  const items = DASHBOARD_NAV_GROUPS.flatMap((group) => group.items)
    .filter((item) => item.href)
    .map((item) => ({
      ...item,
      href: item.href === "/" ? base : `${base}${item.href}`,
    }));

  function isActive(href: string): boolean {
    return isDashboardNavActive(base, href, pathname);
  }

  return (
    <nav aria-label={messages.navLabel} className="sticky top-[4.75rem] z-30 sm:top-[5.25rem]">
      <div className="flex items-center gap-1 rounded-[var(--radius-card)] border border-[var(--line)] bg-[color-mix(in_srgb,var(--shell)_88%,transparent)] p-1.5 shadow-[var(--elevation-2)] backdrop-blur-xl">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {items.map((item) => {
            const Icon = PAGE_ICONS[item.key] ?? GridIcon;
            const current = isActive(item.href);

            return (
              <Link
                key={item.key}
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-[var(--radius-control)] px-3 py-2 text-sm transition-colors duration-[var(--duration)]",
                  current
                    ? "bg-[var(--accent)] font-semibold text-[var(--accent-ink)]"
                    : "text-[var(--ink-muted)] hover:text-[var(--ink)]",
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span className="whitespace-nowrap leading-none">
                  {messages.nav[item.key as keyof AdminMessages["shell"]["nav"]]}
                </span>
              </Link>
            );
          })}
        </div>

        <span aria-hidden="true" className="mx-1 h-6 w-px shrink-0 bg-[var(--line)]" />

        <Link
          href={`/${locale}`}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-[var(--radius-control)] px-2 py-2 text-sm text-[var(--ink-muted)] transition-colors duration-[var(--duration)] hover:text-[var(--ink)]"
        >
          <ChevronIcon direction="start" className="size-4 rtl:rotate-180" />
          <span className="hidden whitespace-nowrap leading-none min-[420px]:inline">
            {messages.backToStore}
          </span>
        </Link>

        <form action={signOutAction}>
          <input type="hidden" name="locale" value={locale} />
          <Button type="submit" variant="ghost" size="sm" className="shrink-0 whitespace-nowrap">
            {signOutLabel}
          </Button>
        </form>
      </div>
    </nav>
  );
}
