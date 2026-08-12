"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Mobile navigation overlay.
 *
 * The trigger's two bars morph into a cross rather than swapping icons. The
 * overlay closes on Escape, on route change, and on backdrop press, and while it
 * is open the page behind it cannot scroll.
 */
export type MobileNavProps = {
  labels: { menu: string; close: string; mobileLabel: string };
  items: { href: string; label: string }[];
  footerItems?: { href: string; label: string }[];
};

export function MobileNav({ labels, items, footerItems = [] }: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const firstLinkRef = useRef<HTMLAnchorElement>(null);

  // Links close the menu themselves; this covers the browser back and forward
  // buttons, which change the route without any click inside the panel.
  useEffect(() => {
    function close() {
      setOpen(false);
    }

    window.addEventListener("popstate", close);

    return () => window.removeEventListener("popstate", close);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    firstLinkRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? labels.close : labels.menu}
        className="grid size-10 shrink-0 place-items-center rounded-full border border-[var(--line)] text-[var(--ink-soft)] transition-colors duration-[var(--duration)] hover:border-[var(--line-strong)] lg:hidden"
      >
        <span className="relative block h-3.5 w-4.5" aria-hidden="true">
          <span
            className={cn(
              "absolute inset-x-0 h-[1.5px] rounded-full bg-current transition-transform duration-[var(--duration)] ease-[var(--ease-spring)]",
              open ? "top-1/2 rotate-45" : "top-0.5",
            )}
          />
          <span
            className={cn(
              "absolute inset-x-0 h-[1.5px] rounded-full bg-current transition-transform duration-[var(--duration)] ease-[var(--ease-spring)]",
              open ? "top-1/2 -rotate-45" : "bottom-0.5",
            )}
          />
        </span>
      </button>

      <div
        id={panelId}
        hidden={!open}
        className="fixed inset-0 z-50 lg:hidden"
        role="dialog"
        aria-modal="true"
        aria-label={labels.mobileLabel}
      >
        <button
          type="button"
          aria-label={labels.close}
          onClick={() => setOpen(false)}
          className="absolute inset-0 h-full w-full cursor-default bg-[color-mix(in_srgb,var(--canvas)_78%,transparent)] backdrop-blur-2xl"
        />

        <nav
          className="gh-fade relative mx-4 mt-24 grid gap-1 rounded-[var(--radius-shell)] border border-[var(--line-strong)] bg-[var(--surface)] p-3 shadow-[var(--elevation-3)]"
          aria-label={labels.mobileLabel}
        >
          {items.map((item, index) => (
            <Link
              key={item.href}
              href={item.href}
              ref={index === 0 ? firstLinkRef : undefined}
              onClick={() => setOpen(false)}
              className="rounded-[var(--radius-control)] px-4 py-3.5 text-base font-semibold text-[var(--ink-soft)] transition-colors duration-[var(--duration)] hover:bg-[var(--surface-strong)] hover:text-[var(--ink)]"
            >
              {item.label}
            </Link>
          ))}

          {footerItems.length > 0 ? (
            <div className="mt-2 grid gap-1 border-t border-[var(--line)] pt-2">
              {footerItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="rounded-[var(--radius-control)] px-4 py-2.5 text-sm text-[var(--ink-muted)] transition-colors duration-[var(--duration)] hover:bg-[var(--surface-strong)] hover:text-[var(--ink)]"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          ) : null}
        </nav>
      </div>
    </>
  );
}
