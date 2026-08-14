"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import type { Locale } from "@/i18n/config";
import type { AdminMessages } from "@/i18n/messages";
import { cn } from "@/lib/cn";

/**
 * Dashboard sidebar navigation.
 *
 * Grouped the way an operator thinks about the store rather than by table name.
 * Sections that are not built yet are rendered as disabled rows carrying an
 * explicit "in progress" badge: hiding them would leave an operator guessing
 * what the dashboard will cover, while linking them would promise a page that
 * does not exist.
 */
export type DashboardNavProps = {
  locale: Locale;
  messages: AdminMessages["shell"];
};

type NavItem = {
  key: keyof AdminMessages["shell"]["nav"];
  href?: string;
};

type NavGroup = {
  key: keyof AdminMessages["shell"]["groups"];
  items: NavItem[];
};

export function DashboardNav({ locale, messages }: DashboardNavProps) {
  const pathname = usePathname() ?? "";
  const base = `/${locale}/dashboard`;

  const groups: NavGroup[] = [
    { key: "overview", items: [{ key: "overview", href: base }] },
    {
      key: "catalog",
      items: [
        { key: "games", href: `${base}/catalog` },
        { key: "website", href: `${base}/website` },
      ],
    },
    {
      key: "operations",
      items: [
        { key: "orders", href: `${base}/orders` },
        { key: "recharges", href: `${base}/recharges` },
        { key: "payments", href: `${base}/payments` },
        { key: "customers", href: `${base}/customers` },
        { key: "support", href: `${base}/support` },
      ],
    },
    {
      key: "settings",
      items: [
        { key: "providers", href: `${base}/providers` },
        { key: "operations", href: `${base}/logs` },
      ],
    },
  ];

  function isActive(href: string): boolean {
    return href === base ? pathname === base : pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <nav aria-label={messages.navLabel} className="grid gap-6">
      {groups.map((group) => (
        <div key={group.key}>
          <h2 className="px-3 text-[0.6875rem] font-semibold tracking-[0.14em] text-[var(--ink-faint)] uppercase">
            {messages.groups[group.key]}
          </h2>
          <ul className="mt-2 grid gap-0.5">
            {group.items.map((item) => {
              const label = messages.nav[item.key];

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
