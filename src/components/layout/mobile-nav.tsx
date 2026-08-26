"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { BellIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

/**
 * Mobile navigation drawer.
 *
 * A sheet anchored to the right edge at full height — physically right in both
 * languages, because the button that opens it is physically right in both
 * languages: the header bar above is pinned so it does not mirror.
 *
 * **Why this was rewritten.** The previous version kept the overlay mounted at
 * all times and hid it with `visibility`, a `transition-[visibility]` and an
 * `inert` attribute. That overlay is `fixed inset-0 z-50` and the header sits at
 * `z-40`, so any one of those three not taking effect leaves an invisible sheet
 * covering the whole viewport — and every tap on the header, including the
 * button that opens it, lands on the sheet instead. A control that silently
 * swallows the page is worse than one that animates less prettily, so the closed
 * overlay is now `pointer-events-none` as well as hidden: three independent
 * reasons it cannot intercept a tap, none of which depends on a transition
 * finishing.
 *
 * Closing is deliberately over-served: the backdrop, Escape, a route change, the
 * breakpoint growing past it, and the button itself. There is no close button
 * inside — a free corner of a full-height sheet is awkward to reach, and a
 * control under the thumb that opened it could not be kept in both reading
 * directions.
 */
export type MobileNavLink = {
  href: string;
  label: string;
  icon?: ReactNode;
  /** Rendered as a count pill; omitted or zero shows nothing. */
  badge?: number;
};

export type MobileNavProps = {
  /**
   * Reading direction for the drawer's contents.
   *
   * Passed in rather than inherited: the trigger sits inside a header bar that
   * is pinned to `ltr` so it does not mirror between languages, and the drawer
   * would otherwise take that as its own.
   */
  dir: "ltr" | "rtl";
  labels: { menu: string; close: string; mobileLabel: string };
  items: MobileNavLink[];
  footerItems?: MobileNavLink[];
  account?: {
    /** Null when signed out, which switches the block to the sign-in call. */
    name: string | null;
    email: string | null;
    avatarUrl: string | null;
    /** Where the identity block leads. */
    href: string;
    /** Shown as a bell beside the name rather than as a row of its own. */
    notifications: { href: string; label: string; count: number };
    /**
     * Wallet balances, rendered directly below the identity block. A server-
     * assembled node: any link pressed inside it closes this drawer.
     */
    walletPanel?: ReactNode;
    links: MobileNavLink[];
    signIn: { href: string; label: string };
  };
  /** Light/dark switch. Lives here on a phone, and in the bar from `lg` up. */
  themeToggle?: ReactNode;
  /** Sign-out form; a server action, so it cannot be assembled here. */
  signOut?: ReactNode;
};

/** First letter of the name, which is all an avatar fallback needs to say. */
function initial(name: string): string {
  return [...name.trim()][0]?.toUpperCase() ?? "?";
}

function isCurrent(pathname: string, href: string): boolean {
  // A locale root is only ever itself; everything else also owns its children,
  // so a game detail page keeps "Games" marked.
  const isLocaleRoot = href.split("/").filter(Boolean).length === 1;

  return isLocaleRoot
    ? pathname === href || pathname === `${href}/`
    : pathname === href || pathname.startsWith(`${href}/`);
}

export function MobileNav({
  dir,
  labels,
  items,
  footerItems = [],
  account,
  themeToggle,
  signOut,
}: MobileNavProps) {
  const [open, setOpen] = useState(false);

  /*
   * The overlay renders into <body> through a portal, and only after hydration.
   * `useSyncExternalStore` hands the server `false` and the client `true`, which
   * keeps both render passes identical while a mounted-state effect would trip
   * React's own lint rules.
   */
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );

  const panelId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname() ?? "";

  const close = useCallback(() => setOpen(false), []);

  // Links close the drawer themselves; this covers the browser's back and
  // forward buttons, which change the route with no press inside the panel.
  useEffect(() => {
    window.addEventListener("popstate", close);

    return () => window.removeEventListener("popstate", close);
  }, [close]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        close();
      }
    }

    /*
     * The page behind must not scroll under the sheet. Restored to whatever it
     * was rather than to `""`, so a page that sets its own overflow keeps it.
     */
    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);

    // Focus moves into the sheet so a keyboard or screen-reader user is not
    // left behind on the trigger, reading a page they can no longer reach.
    panelRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  /*
   * Above `lg` the drawer's links live in the bar instead, so a rotation or a
   * resize past the breakpoint has to close it — otherwise a sheet stays open
   * over a layout that already shows everything in it, with no visible way out.
   */
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");

    function onChange(event: MediaQueryListEvent) {
      if (event.matches) {
        setOpen(false);
      }
    }

    query.addEventListener("change", onChange);

    return () => query.removeEventListener("change", onChange);
  }, []);

  function renderLink(item: MobileNavLink, options: { quiet?: boolean } = {}) {
    const current = isCurrent(pathname, item.href);

    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={close}
        aria-current={current ? "page" : undefined}
        className={cn(
          "flex items-center gap-3 rounded-[var(--radius-control)] transition-colors duration-150",
          options.quiet
            ? "min-h-11 px-3 text-sm font-medium text-[var(--ink-muted)]"
            : "min-h-12 px-3 text-[0.9375rem] font-semibold",
          current && !options.quiet
            ? "bg-[var(--surface-strong)] text-[var(--ink)]"
            : "text-[var(--ink-soft)] hover:bg-[var(--surface-strong)] hover:text-[var(--ink)] active:bg-[var(--surface-strong)]",
        )}
      >
        {item.icon ? (
          <span
            aria-hidden="true"
            className={cn(
              "grid size-5 shrink-0 place-items-center [&>svg]:size-5",
              current ? "text-[var(--accent)]" : "text-[var(--ink-faint)]",
            )}
          >
            {item.icon}
          </span>
        ) : null}

        <span className="min-w-0 flex-1 truncate">{item.label}</span>

        {item.badge && item.badge > 0 ? (
          <span className="grid min-w-5 shrink-0 place-items-center rounded-full bg-[var(--accent)] px-1.5 text-[0.6875rem] font-bold text-[var(--accent-ink)] tabular-nums">
            {item.badge > 9 ? "9+" : item.badge}
          </span>
        ) : null}
      </Link>
    );
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
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

      {/*
       * Portaled out of the header so it is free of the bar that holds it. That
       * bar runs `backdrop-filter`, which quietly turns itself into the
       * containing block for any `fixed` child — the sheet would otherwise
       * stretch across the whole viewport while its click-to-close backdrop
       * stayed pinned to the header strip it was born under.
       */}
      {mounted
        ? createPortal(
            <div
              // The document's direction, restored: the pinned header bar above
              // would otherwise impose its own on everything written inside.
              dir={dir}
              aria-hidden={!open}
              className={cn(
                "fixed inset-0 z-50 lg:hidden",
                // Three independent reasons a closed sheet cannot take a tap.
                // The header sits below this in the stack, so one of them
                // failing used to cost the whole page its taps.
                open ? "visible" : "pointer-events-none invisible",
              )}
            >
              <button
                type="button"
                tabIndex={open ? undefined : -1}
                aria-label={labels.close}
                onClick={close}
                className={cn(
                  "absolute inset-0 h-full w-full cursor-default bg-[color-mix(in_srgb,var(--canvas)_70%,transparent)] transition-opacity duration-[var(--duration)] ease-out motion-reduce:transition-none",
                  // The blur rides with the fade rather than sitting on a
                  // transparent element: `backdrop-filter` builds its own
                  // stacking context and does not reliably vanish at opacity 0.
                  open ? "opacity-100 backdrop-blur-md" : "opacity-0",
                )}
              />

              <div
                ref={panelRef}
                id={panelId}
                role="dialog"
                aria-modal="true"
                aria-label={labels.mobileLabel}
                tabIndex={-1}
                className={cn(
                  "absolute inset-y-0 right-0 flex h-[100dvh] w-[min(21rem,88vw)] flex-col border-l border-[var(--line)] bg-[var(--surface)] pt-[max(0.75rem,env(safe-area-inset-top))] transition-transform duration-[420ms] ease-[var(--ease-spring)] will-change-transform focus:outline-none motion-reduce:transition-none",
                  open ? "translate-x-0 shadow-[var(--elevation-3)]" : "translate-x-full shadow-none",
                )}
              >
                {account ? (
                  <div className="shrink-0 px-3 pb-3">
                    {account.name === null ? (
                      <Link
                        href={account.signIn.href}
                        onClick={close}
                        className="flex min-h-12 items-center justify-center rounded-[var(--radius-control)] bg-[var(--accent)] px-4 text-[0.9375rem] font-semibold text-[var(--accent-ink)] transition-colors duration-150 hover:bg-[var(--accent-strong)]"
                      >
                        {account.signIn.label}
                      </Link>
                    ) : (
                      <div className="flex items-center gap-2 rounded-[var(--radius-card)] bg-[var(--shell)] p-2">
                        <Link
                          href={account.href}
                          onClick={close}
                          className="flex min-w-0 flex-1 items-center gap-3 rounded-[var(--radius-control)] p-1 transition-colors duration-150 hover:bg-[var(--surface-strong)]"
                        >
                          {/*
                            * A plain `img`, not the optimizer: an avatar is one
                            * small square from a host we do not control, and
                            * routing it through image optimization buys nothing
                            * at this size.
                            */}
                          {account.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={account.avatarUrl}
                              alt=""
                              width={44}
                              height={44}
                              className="size-11 shrink-0 rounded-full border border-[var(--line)] object-cover"
                            />
                          ) : (
                            <span
                              aria-hidden="true"
                              className="grid size-11 shrink-0 place-items-center rounded-full border border-[var(--line-strong)] bg-[linear-gradient(140deg,color-mix(in_srgb,var(--accent)_30%,var(--surface-strong)),var(--surface-strong))] text-lg font-bold text-[var(--accent-strong)]"
                            >
                              {initial(account.name)}
                            </span>
                          )}

                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-[var(--ink)]">
                              {account.name}
                            </span>
                            {account.email ? (
                              <span className="block truncate text-xs text-[var(--ink-faint)]" dir="ltr">
                                {account.email}
                              </span>
                            ) : null}
                          </span>
                        </Link>

                        {/*
                          * Notifications as a bell rather than a labelled row. It
                          * is the one account destination carrying a live count,
                          * and a count is what the eye hunts for — a word in a
                          * list hides it.
                          */}
                        <Link
                          href={account.notifications.href}
                          onClick={close}
                          aria-label={account.notifications.label}
                          className="relative grid size-11 shrink-0 place-items-center rounded-full text-[var(--ink-soft)] transition-colors duration-150 hover:bg-[var(--surface-strong)] hover:text-[var(--ink)] active:bg-[var(--surface-strong)] [&>svg]:size-5"
                        >
                          <BellIcon />
                          {account.notifications.count > 0 ? (
                            <span className="absolute top-1 end-1 grid min-w-4.5 place-items-center rounded-full bg-[var(--accent)] px-1 text-[0.625rem] font-bold text-[var(--accent-ink)] tabular-nums">
                              {account.notifications.count > 9 ? "9+" : account.notifications.count}
                            </span>
                          ) : null}
                        </Link>
                      </div>
                    )}
                  </div>
                ) : null}

                <nav className="flex-1 overflow-y-auto overscroll-contain px-3 pb-2">
                  {account?.walletPanel ? (
                    /*
                     * Wallets sit directly under the profile block, before the
                     * primary destinations: balances are checked more often
                     * than the catalog is browsed. The capture-phase handler
                     * closes the drawer when a link inside is used — the node
                     * arrives from the server, so its own links cannot call
                     * `close` themselves.
                     */
                    <div
                      className="mb-2 grid gap-0.5 border-b border-[var(--line)] pb-2"
                      onClickCapture={(event) => {
                        if ((event.target as HTMLElement).closest("a")) {
                          close();
                        }
                      }}
                    >
                      {account.walletPanel}
                    </div>
                  ) : null}

                  <div className="grid gap-0.5">{items.map((item) => renderLink(item))}</div>

                  {account && account.name !== null && account.links.length > 0 ? (
                    <div className="mt-2 grid gap-0.5 border-t border-[var(--line)] pt-2">
                      {account.links.map((item) => renderLink(item))}
                    </div>
                  ) : null}

                  {footerItems.length > 0 ? (
                    <div className="mt-2 grid gap-0.5 border-t border-[var(--line)] pt-2">
                      {footerItems.map((item) => renderLink(item, { quiet: true }))}
                    </div>
                  ) : null}
                </nav>

                {/*
                  * The controls that are settings rather than destinations:
                  * language, theme, and the way out. They sit together at the
                  * foot of the sheet because none of them navigates anywhere,
                  * and on a phone this is where a thumb already rests.
                  */}
                {themeToggle || signOut ? (
                  <div className="flex shrink-0 items-center gap-2 border-t border-[var(--line)] px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                    {themeToggle}
                    {signOut ? <div className="ms-auto">{signOut}</div> : null}
                  </div>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
