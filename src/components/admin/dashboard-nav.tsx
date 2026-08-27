"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactElement, type SVGProps } from "react";
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
 * Five grouped buttons, not thirteen scrolling tabs.
 *
 * Each top-level group is one button. Groups with a single page act as a
 * direct link; groups with several pages open a small dropdown. The bar never
 * scrolls — five buttons fit everywhere — and one-time configuration (providers,
 * website, appearance) lives inside its group instead of always in view.
 * No logout or "back to store" here; those belong to the site header and the
 * account menu, not the working surface.
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
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const navRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(event: MouseEvent): void {
      if (!navRef.current) return;
      if (!navRef.current.contains(event.target as Node)) setOpenGroup(null);
    }
    function onEsc(event: KeyboardEvent): void {
      if (event.key === "Escape") setOpenGroup(null);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpenGroup(null);
  }, [pathname]);

  function isActive(href: string): boolean {
    return isDashboardNavActive(base, href, pathname);
  }

  return (
    <nav ref={navRef} aria-label={messages.navLabel} className="sticky top-[4.75rem] z-30 sm:top-[5.25rem]">
      <div className="flex flex-wrap items-center gap-1.5 rounded-[var(--radius-card)] border border-[var(--line)] bg-[color-mix(in_srgb,var(--shell)_88%,transparent)] p-1.5 shadow-[var(--elevation-2)] backdrop-blur-xl">
        {DASHBOARD_NAV_GROUPS.map((group) => {
          const groupLabel = messages.nav[group.key as keyof AdminMessages["shell"]["nav"]] ?? group.key;
          const GroupIcon = GROUP_ICONS[group.key] ?? GridIcon;
          const items = group.items
            .filter((item) => item.href)
            .map((item) => ({
              ...item,
              href: item.href === "/" ? base : `${base}${item.href}`,
              label: messages.nav[item.key as keyof AdminMessages["shell"]["nav"]] ?? item.key,
            }));
          const isGroupActive = items.some((item) => isActive(item.href));
          const isOpen = openGroup === group.key;
          const singleLink = items.length === 1 ? items[0] : null;

          if (singleLink) {
            return (
              <Link
                key={group.key}
                href={singleLink.href}
                prefetch={false}
                aria-current={isGroupActive ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-[var(--radius-control)] px-3.5 py-2.5 text-sm font-medium transition-colors duration-[var(--duration)]",
                  isGroupActive
                    ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                    : "text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]",
                )}
              >
                <GroupIcon className="size-4 shrink-0" />
                <span className="whitespace-nowrap leading-none">{groupLabel}</span>
              </Link>
            );
          }

          return (
            <div key={group.key} className="relative">
              <button
                type="button"
                aria-expanded={isOpen}
                aria-haspopup="menu"
                onClick={() => setOpenGroup(isOpen ? null : group.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-[var(--radius-control)] px-3.5 py-2.5 text-sm font-medium transition-colors duration-[var(--duration)]",
                  isGroupActive
                    ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                    : isOpen
                      ? "bg-[var(--surface)] text-[var(--ink)]"
                      : "text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]",
                )}
              >
                <GroupIcon className="size-4 shrink-0" />
                <span className="whitespace-nowrap leading-none">{groupLabel}</span>
                <ChevronIcon
                  direction={isOpen ? "up" : "down"}
                  className={cn("size-3 shrink-0 opacity-70 transition-transform", isOpen && "rotate-180")}
                />
              </button>

              {isOpen ? (
                <div
                  role="menu"
                  className="absolute start-0 top-full z-40 mt-2 min-w-[12rem] rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--shell)] p-1.5 shadow-[var(--elevation-3)]"
                >
                  {items.map((item) => {
                    const Icon = PAGE_ICONS[item.key] ?? GridIcon;
                    const current = isActive(item.href);
                    return (
                      <Link
                        key={item.key}
                        href={item.href}
                        prefetch={false}
                        role="menuitem"
                        aria-current={current ? "page" : undefined}
                        onClick={() => setOpenGroup(null)}
                        className={cn(
                          "flex items-center gap-2 rounded-[var(--radius-control)] px-3 py-2 text-sm transition-colors",
                          current
                            ? "bg-[var(--accent)] font-medium text-[var(--accent-ink)]"
                            : "text-[var(--ink)] hover:bg-[var(--surface)]",
                        )}
                      >
                        <Icon className="size-4 shrink-0 opacity-80" />
                        <span className="whitespace-nowrap">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
