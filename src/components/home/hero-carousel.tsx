"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type TouchEvent as ReactTouchEvent,
} from "react";
import { StoreImage } from "@/components/store/store-image";
import { Badge } from "@/components/ui/badge";
import { ArrowIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";
import type { StoreGame } from "@/lib/catalog/game-mapper";
import { cn } from "@/lib/cn";
import { formatMessage } from "@/i18n/messages";

/**
 * Featured games carousel.
 *
 * Follows the APG carousel pattern: a labelled `group` with
 * `aria-roledescription="carousel"`, one live slide at a time, and a rotation
 * control that is only rendered when rotation is actually running.
 *
 * Rotation never starts when the visitor prefers reduced motion, and it pauses
 * on hover, on focus within, and while the tab is hidden. Slides cross-fade in
 * place, so nothing reflows as the index changes.
 *
 * This is the first thing on the homepage and the largest thing on a phone, so
 * it is built for a thumb before a pointer: it can be swiped, its controls are
 * full touch targets, and it is portrait on a phone and wide on a desktop rather
 * than one shape stretched to both.
 */
export type HeroCarouselProps = {
  games: StoreGame[];
  locale: Locale;
  intervalSeconds: number;
  labels: {
    regionLabel: string;
    slideLabel: string;
    goToSlide: string;
    details: string;
    featured: string;
  };
  className?: string;
};

/** Far enough that a hesitant scroll is not read as a swipe. */
const SWIPE_MIN_PX = 44;

export function HeroCarousel({
  games,
  locale,
  intervalSeconds,
  labels,
  className,
}: HeroCarouselProps) {
  const [index, setIndex] = useState(0);
  const [rotating, setRotating] = useState(false);
  const [paused, setPaused] = useState(false);
  const containerId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);

  const total = games.length;

  const go = useCallback(
    (next: number) => {
      setIndex(((next % total) + total) % total);
    },
    [total],
  );

  // Rotation is opt-in at runtime: it only starts once we know the visitor has
  // not asked for reduced motion, which is unknowable during server rendering.
  useEffect(() => {
    if (total < 2) {
      return;
    }

    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setRotating(!query.matches);

    apply();
    query.addEventListener("change", apply);

    return () => query.removeEventListener("change", apply);
  }, [total]);

  useEffect(() => {
    if (!rotating || paused || total < 2) {
      return;
    }

    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % total);
    }, Math.max(3, intervalSeconds) * 1000);

    return () => window.clearInterval(timer);
  }, [rotating, paused, total, intervalSeconds]);

  useEffect(() => {
    function onVisibilityChange() {
      setPaused(document.hidden);
    }

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  /** Reading order, not screen order: in RTL the next slide lies to the left. */
  function step(element: HTMLElement, towards: "left" | "right") {
    const isRtl = getComputedStyle(element).direction === "rtl";
    const forward = towards === (isRtl ? "left" : "right");

    go(index + (forward ? 1 : -1));
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      step(event.currentTarget, event.key === "ArrowRight" ? "right" : "left");
    }
  }

  /*
   * Swipe.
   *
   * Only the horizontal intent counts: a finger that moved further vertically is
   * someone scrolling past, and stealing that would make the page feel stuck.
   * Nothing calls `preventDefault`, so the carousel never blocks a scroll it
   * turns out not to own.
   */
  function onTouchStart(event: ReactTouchEvent<HTMLDivElement>) {
    const touch = event.touches[0];

    swipe.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
    setPaused(true);
  }

  function onTouchEnd(event: ReactTouchEvent<HTMLDivElement>) {
    const start = swipe.current;
    const touch = event.changedTouches[0];

    swipe.current = null;
    setPaused(false);

    if (!start || !touch || total < 2) {
      return;
    }

    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;

    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) <= Math.abs(dy)) {
      return;
    }

    // Dragging the content leftward reveals what comes after it on the right.
    step(event.currentTarget, dx < 0 ? "right" : "left");
  }

  if (total === 0) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      id={containerId}
      role="group"
      aria-roledescription="carousel"
      aria-label={labels.regionLabel}
      className={cn("relative", className)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(event: FocusEvent<HTMLDivElement>) => {
        // Only resume once focus has actually left the carousel, not when it
        // moves between the slide link and the controls.
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setPaused(false);
        }
      }}
      onKeyDown={onKeyDown}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="rounded-[var(--radius-shell)] border border-[var(--line)] bg-[var(--shell)] p-1.5 backdrop-blur-xl">
        {/*
          * Portrait on a phone, wide on a desktop. It used to be portrait at
          * every size because it sat in a narrow column beside the old hero;
          * full width, that shape would be several screens tall on a laptop.
          */}
        <div className="gh-sheen relative aspect-[4/5] overflow-hidden rounded-[var(--radius-inner)] border border-[var(--line)] bg-[var(--surface-inset)] sm:aspect-[16/10] lg:aspect-[21/9]">
          {games.map((game, slideIndex) => {
            const isActive = slideIndex === index;

            return (
              <div
                key={game.id}
                role="group"
                aria-roledescription="slide"
                aria-label={formatMessage(
                  labels.slideLabel,
                  { index: slideIndex + 1, total },
                  locale,
                )}
                aria-hidden={!isActive}
                className={cn(
                  "absolute inset-0 transition-opacity duration-[var(--duration-slow)] ease-[var(--ease-out-expo)]",
                  isActive ? "opacity-100" : "pointer-events-none opacity-0",
                )}
              >
                <StoreImage
                  src={game.imageUrl}
                  alt={game.name}
                  focus={game.carouselFocus}
                  priority={slideIndex === 0}
                  // Full width now, so the old 34rem desktop hint would have
                  // fetched an image too small for the space it fills.
                  sizes="(min-width: 1280px) 1200px, (min-width: 640px) 92vw, 100vw"
                  className={cn(
                    "transition-transform duration-[2400ms] ease-[var(--ease-out-expo)]",
                    isActive ? "scale-105" : "scale-100",
                  )}
                />
                <div
                  className="absolute inset-0 bg-[linear-gradient(to_top,color-mix(in_srgb,var(--canvas)_94%,transparent)_6%,color-mix(in_srgb,var(--canvas)_55%,transparent)_40%,transparent_70%)]"
                  aria-hidden="true"
                />

                {/* Capped, so the copy does not run the width of a wide screen. */}
                <div className="absolute inset-x-0 bottom-0 max-w-2xl p-5 sm:p-7 lg:p-9">
                  <div className="flex flex-wrap items-center gap-2">
                    {game.carouselBadge ? (
                      <Badge tone="accent">{game.carouselBadge}</Badge>
                    ) : game.isFeatured ? (
                      <Badge tone="accent">{labels.featured}</Badge>
                    ) : null}
                    {game.pointsName ? <Badge tone="neutral">{game.pointsName}</Badge> : null}
                  </div>

                  <h3 className="mt-3 text-[clamp(1.5rem,3.4vw,2.25rem)] leading-[1.12] font-semibold tracking-[-0.03em] text-[var(--ink)]">
                    {game.name}
                  </h3>

                  {game.description ? (
                    <p className="mt-2 line-clamp-2 max-w-md text-sm leading-6 text-[var(--ink-soft)]">
                      {game.description}
                    </p>
                  ) : null}

                  <Link
                    href={`/${locale}/games/${game.slug}`}
                    tabIndex={isActive ? undefined : -1}
                    className="group mt-5 inline-flex min-h-12 items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--accent)] ps-5 pe-1.5 text-sm font-semibold text-[var(--accent-ink)] transition-colors duration-[var(--duration)] hover:bg-[var(--accent-strong)] sm:min-h-11"
                  >
                    {labels.details}
                    <span className="grid size-8 place-items-center rounded-full bg-[color-mix(in_srgb,var(--accent-ink)_14%,transparent)] transition-transform duration-[var(--duration)] ease-[var(--ease-spring)] group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5">
                      <ArrowIcon direction="end" className="size-4 rtl:rotate-180" />
                    </span>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/*
        * Dots only. The arrows and the pause control were removed: on a phone
        * the slide is swiped and on a pointer it is hovered, which pauses
        * rotation anyway — so both were chrome that earned nothing. The dots
        * stay because they say how many slides there are, which nothing else
        * does, and they remain the keyboard-reachable way to jump.
        */}
      {total > 1 ? (
        <div className="mt-3 flex items-center justify-center sm:mt-4">
          <ul className="flex items-center" role="list">
            {games.map((game, slideIndex) => (
              <li key={game.id}>
                {/*
                  * The bar is 6px tall; the button around it is 44, which is the
                  * smallest thing a thumb should be asked to hit. The padding is
                  * the target — shrinking it to fit the visual would make these
                  * unusable on the device most people arrive on.
                  */}
                <button
                  type="button"
                  onClick={() => go(slideIndex)}
                  aria-label={formatMessage(labels.goToSlide, { index: slideIndex + 1 }, locale)}
                  aria-current={slideIndex === index ? "true" : undefined}
                  className="grid h-11 place-items-center px-1"
                >
                  <span
                    className={cn(
                      "block h-1.5 rounded-full transition-[width,background-color] duration-[var(--duration)] ease-[var(--ease-spring)]",
                      slideIndex === index
                        ? "w-7 bg-[var(--accent)]"
                        : "w-2.5 bg-[var(--line-strong)]",
                    )}
                  />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
