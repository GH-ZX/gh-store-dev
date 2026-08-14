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
  type TouchEvent as ReactTouchEvent,
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
 * Built to be closed as easily as it is opened, which is the part that decides
 * whether a drawer feels good: it takes a drag toward the edge and follows the
 * finger while it does, the backdrop, Escape, a route change, and the breakpoint
 * growing past it. There is deliberately no close button — a free corner of a
 * full-height sheet is awkward to reach, and closing under the thumb that opened
 * it was impossible to keep in both reading directions.
 *
 * Two details carry most of the feel. The panel slides on a generous 600ms in
 * and the same 600ms out, so the open and the close read as one unhurried
 * motion rather than a quick blink. And while a drag is in progress the
 * transition is switched off entirely, so the panel tracks the finger instead
 * of easing behind it.
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
    links: MobileNavLink[];
    signIn: { href: string; label: string };
  };
  /** Language button, built by the server so it can read the query string. */
  localeSwitcher?: ReactNode;
  /** Sign-out form; a server action, so it cannot be assembled here. */
  signOut?: ReactNode;
};

/** Past this many pixels dragged toward the edge, release closes the drawer. */
const CLOSE_AFTER_PX = 72;

/** A flick this fast closes regardless of how far it travelled. */
const FLICK_PX_PER_MS = 0.5;

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
  localeSwitcher,
  signOut,
}: MobileNavProps) {
  const [open, setOpen] = useState(false);
  /** Pixels dragged toward the closing edge; null while no drag is running. */
  const [drag, setDrag] = useState<number | null>(null);

  /*
   * The overlay renders into <body> through a portal, and only after hydration.
   * On the server there is nothing to portal to, and a drawer that is closed by
   * default should not paint at all. `useSyncExternalStore` hands the server a
   * `false` snapshot and the client `true`, which keeps the two passes' markup
   * identical while a mounted-state effect would trip React's own lint rules.
   */
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );

  const panelId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ x: number; y: number; at: number; axis: "?" | "x" | "y" } | null>(null);

  const pathname = usePathname() ?? "";
  /*
   * A close is also a settle. `drag` only clears in `onTouchEnd`, so a drawer
   * closed mid-gesture — Escape, the backdrop, a route change — would otherwise
   * reopen sitting where the finger left it.
   */
  const close = useCallback(() => {
    setDrag(null);
    gesture.current = null;
    setOpen(false);
  }, []);

  // Links close the drawer themselves; this covers the browser back and forward
  // buttons, which change the route without any press inside the panel.
  useEffect(() => {
    window.addEventListener("popstate", close);

    return () => window.removeEventListener("popstate", close);
  }, [close]);

  /*
   * Close when the viewport grows past the breakpoint this drawer belongs to.
   * `lg:hidden` would take it off the screen on its own, but the scroll lock
   * below is JavaScript and would stay applied — leaving a desktop layout that
   * cannot be scrolled and no visible thing to blame.
   */
  useEffect(() => {
    const query = window.matchMedia("(min-width: 64rem)");
    const apply = () => {
      if (query.matches) {
        close();
      }
    };

    apply();
    query.addEventListener("change", apply);

    return () => query.removeEventListener("change", apply);
  }, [close]);

  /*
   * Focus is moved in, kept in, and handed back.
   *
   * Without the loop, tabbing walks straight out of an open drawer and onto the
   * page behind it, which is invisible and inert — the sighted keyboard user
   * loses the cursor entirely.
   */
  useEffect(() => {
    if (!open) {
      return;
    }

    const returnTo = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";
    // There is no close control to land focus on, so the sheet itself takes it.
    panelRef.current?.focus({ preventScroll: true });

    /*
     * Only the sheet deserves the screen while it is up: `aria-modal` and the
     * tab loop keep keyboard focus inside, but a screen reader's virtual cursor
     * reads the whole document. The rest of the <body> goes `inert` for the
     * duration, then gets it back — including the header that holds this very
     * drawer, which is found by climbing from the panel.
     */
    let host: HTMLElement | null = panelRef.current;
    while (host?.parentElement && host.parentElement !== document.body) {
      host = host.parentElement;
    }
    const inerted: HTMLElement[] = [];
    if (host) {
      for (const child of Array.from(document.body.children)) {
        if (child instanceof HTMLElement && child !== host && !child.hasAttribute("inert")) {
          child.setAttribute("inert", "");
          inerted.push(child);
        }
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        close();

        return;
      }

      if (event.key !== "Tab" || !panelRef.current) {
        return;
      }

      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (!first || !last) {
        return;
      }

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      inerted.forEach((element) => element.removeAttribute("inert"));
      returnTo?.focus?.();
    };
  }, [open, close]);

  /*
   * Drag to dismiss.
   *
   * The axis is locked on the first meaningful move and never revisited: a
   * finger that started downward is scrolling the list, and a drawer that
   * changes its mind halfway through a scroll is the single most irritating
   * thing a sheet can do. Only movement toward the edge counts, so dragging the
   * other way does nothing rather than tearing the panel off its anchor.
   */
  function onTouchStart(event: ReactTouchEvent<HTMLDivElement>) {
    const touch = event.touches[0];

    gesture.current = touch
      ? { x: touch.clientX, y: touch.clientY, at: event.timeStamp, axis: "?" }
      : null;
  }

  function onTouchMove(event: ReactTouchEvent<HTMLDivElement>) {
    const start = gesture.current;
    const touch = event.touches[0];

    if (!start || !touch) {
      return;
    }

    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;

    if (start.axis === "?") {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) {
        return;
      }

      start.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    }

    if (start.axis !== "x") {
      return;
    }

    const width = panelRef.current?.offsetWidth ?? 336;
    const progress = Math.max(0, dx);
    // Once the panel's own width is behind it, the sheet resists: effort buys
    // less travel, which reads as reaching the end rather than sailing past it.
    setDrag(progress > width ? width + (progress - width) * 0.2 : progress);
  }

  function onTouchEnd(event: ReactTouchEvent<HTMLDivElement>) {
    const start = gesture.current;
    const touch = event.changedTouches[0];

    gesture.current = null;
    setDrag(null);

    if (!start || !touch || start.axis !== "x") {
      return;
    }

    const dx = touch.clientX - start.x;
    const elapsed = Math.max(1, event.timeStamp - start.at);

    if (dx > CLOSE_AFTER_PX || dx / elapsed > FLICK_PX_PER_MS) {
      setOpen(false);
    }
  }

  const dragging = drag !== null;

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
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
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
       * Portaled out of the header so it is free of the bar that holds it.
       * That bar runs `backdrop-filter`, which quietly turns itself into the
       * containing block for any `fixed` child — the sheet would otherwise
       * stretch across the whole viewport while its click-to-close backdrop
       * stayed pinned to the header strip it was born under.
       */}
      {mounted
        ? createPortal(
            <div
              // The document's direction, restored: the pinned header bar above
              // would otherwise impose its own on everything written inside the
              // panel.
              dir={dir}
              /*
               * `invisible` while closed, not merely translated away. Off screen
               * is a position, not an absence — a shadow, a blurred backdrop or a
               * sliver at some viewport width all survive it. `visibility` sits in
               * the transition list so it holds `visible` through the whole slide
               * out and only then stops rendering, which is the one property that
               * behaves that way.
               *
               * `pan-y` on the whole overlay hands vertical scrolling back to the
               * browser and reserves horizontal for the drag, so the sheet follows
               * the finger no matter where it started — on the panel or on the
               * mostly blank backdrop.
               */
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
              onTouchCancel={onTouchEnd}
              className={cn(
                "fixed inset-0 z-50 touch-pan-y transition-[visibility] duration-[var(--duration)] lg:hidden",
                open ? "visible" : "invisible",
              )}
              inert={!open}
            >
              <button
                type="button"
                tabIndex={-1}
                aria-label={labels.close}
                onClick={close}
                className={cn(
                  "absolute inset-0 h-full w-full cursor-default bg-[color-mix(in_srgb,var(--canvas)_70%,transparent)] transition-opacity duration-[var(--duration)] ease-out motion-reduce:transition-none",
                  // The blur rides with the fade rather than sitting on a
                  // transparent element: `backdrop-filter` builds its own stacking
                  // context and does not reliably disappear at `opacity: 0`.
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
                /*
                 * `pan-y` hands vertical scrolling to the browser and keeps
                 * horizontal for the drag above, so the list still scrolls at
                 * native speed. `100dvh` because a phone's browser chrome shrinks
                 * the viewport as it scrolls and `vh` would run the sheet
                 * underneath it.
                 */
                style={
                  dragging
                    ? { transform: `translate3d(${drag}px,0,0)`, transition: "none" }
                    : undefined
                }
                className={cn(
                  "absolute inset-y-0 right-0 flex h-[100dvh] w-[min(21rem,88vw)] touch-pan-y flex-col border-l border-[var(--line)] bg-[var(--surface)] pt-[max(0.75rem,env(safe-area-inset-top))] transition-[transform,box-shadow] duration-[600ms] ease-[var(--ease-spring)] will-change-transform focus:outline-none motion-reduce:transition-none",
                  // The shadow is dropped while closed: a panel parked past the
                  // right edge still casts leftward, which would leave a dark
                  // strip down the side of a page with no drawer open.
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
                            * routing it through image optimization buys nothing at
                            * this size.
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

                <nav
                  className="flex-1 overflow-y-auto overscroll-contain px-3 pb-2"
                >
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

                {localeSwitcher || signOut ? (
                  <div className="flex shrink-0 items-center justify-between gap-2 border-t border-[var(--line)] px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                    {localeSwitcher}
                    {signOut}
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
