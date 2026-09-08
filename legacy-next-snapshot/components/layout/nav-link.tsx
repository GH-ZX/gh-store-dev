"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Primary navigation link that marks itself as the current page.
 *
 * The home link matches its path exactly; every other link also matches its
 * nested routes, so a game detail page keeps "Games" highlighted.
 */
export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const isLocaleRoot = href.split("/").filter(Boolean).length === 1;
  const isActive = isLocaleRoot
    ? pathname === href || pathname === `${href}/`
    : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={
        isActive
          ? "rounded-[var(--radius-pill)] bg-[var(--surface-strong)] px-3.5 py-2 text-sm font-semibold text-[var(--ink)]"
          : "rounded-[var(--radius-pill)] px-3.5 py-2 text-sm font-medium text-[var(--ink-muted)] transition-colors duration-[var(--duration)] hover:bg-[var(--shell)] hover:text-[var(--ink)]"
      }
    >
      {children}
    </Link>
  );
}
