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
} from "react";
import { StoreImage } from "@/components/store/store-image";
import { Badge } from "@/components/ui/badge";
import { ArrowIcon, ChevronIcon, PauseIcon, PlayIcon } from "@/components/ui/icons";
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
 */
export type HeroCarouselProps = {
  games: StoreGame[];
  locale: Locale;
  intervalSeconds: number;
  labels: {
    regionLabel: string;
    slideLabel: string;
    goToSlide: string;
    pause: string;
    play: string;
    previous: string;
    next: string;
    details: string;
    featured: string;
  };
  className?: string;
};

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

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    // Arrow keys follow reading order: in RTL, ArrowLeft advances.
    const isRtl = getComputedStyle(event.currentTarget).direction === "rtl";

    if (event.key === "ArrowRight") {
      event.preventDefault();
      go(index + (isRtl ? -1 : 1));
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      go(index + (isRtl ? 1 : -1));
    }
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
    >
      <div className="rounded-[var(--radius-shell)] border border-[var(--line)] bg-[var(--shell)] p-1.5 backdrop-blur-xl">
        <div className="gh-sheen relative aspect-[4/5] overflow-hidden rounded-[var(--radius-inner)] border border-[var(--line)] bg-[var(--surface-inset)] sm:aspect-[3/4] lg:aspect-[4/5]">
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
                  sizes="(min-width: 1024px) 34rem, 92vw"
                  className={cn(
                    "transition-transform duration-[2400ms] ease-[var(--ease-out-expo)]",
                    isActive ? "scale-105" : "scale-100",
                  )}
                />
                <div
                  className="absolute inset-0 bg-[linear-gradient(to_top,color-mix(in_srgb,var(--canvas)_94%,transparent)_6%,color-mix(in_srgb,var(--canvas)_55%,transparent)_40%,transparent_70%)]"
                  aria-hidden="true"
                />

                <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6">
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
                    className="group mt-5 inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--accent)] ps-5 pe-1.5 text-sm font-semibold text-[var(--accent-ink)] transition-colors duration-[var(--duration)] hover:bg-[var(--accent-strong)]"
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

      {total > 1 ? (
        <div className="mt-4 flex items-center justify-between gap-3">
          <ul className="flex items-center gap-1.5" role="list">
            {games.map((game, slideIndex) => (
              <li key={game.id}>
                <button
                  type="button"
                  onClick={() => go(slideIndex)}
                  aria-label={formatMessage(labels.goToSlide, { index: slideIndex + 1 }, locale)}
                  aria-current={slideIndex === index ? "true" : undefined}
                  className={cn(
                    "h-1.5 rounded-full transition-[width,background-color] duration-[var(--duration)] ease-[var(--ease-spring)]",
                    slideIndex === index
                      ? "w-7 bg-[var(--accent)]"
                      : "w-2.5 bg-[var(--line-strong)] hover:bg-[var(--ink-faint)]",
                  )}
                />
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-1.5">
            {rotating ? (
              <button
                type="button"
                onClick={() => setPaused((value) => !value)}
                aria-label={paused ? labels.play : labels.pause}
                className="grid size-9 place-items-center rounded-full border border-[var(--line)] text-[var(--ink-muted)] transition-colors duration-[var(--duration)] hover:border-[var(--line-strong)] hover:text-[var(--ink)] [&>svg]:size-4"
              >
                {paused ? <PlayIcon /> : <PauseIcon />}
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => go(index - 1)}
              aria-label={labels.previous}
              aria-controls={containerId}
              className="grid size-9 place-items-center rounded-full border border-[var(--line)] text-[var(--ink-soft)] transition-colors duration-[var(--duration)] hover:border-[var(--line-strong)] hover:text-[var(--ink)] [&>svg]:size-4"
            >
              <ChevronIcon direction="start" className="rtl:rotate-180" />
            </button>
            <button
              type="button"
              onClick={() => go(index + 1)}
              aria-label={labels.next}
              aria-controls={containerId}
              className="grid size-9 place-items-center rounded-full border border-[var(--line)] text-[var(--ink-soft)] transition-colors duration-[var(--duration)] hover:border-[var(--line-strong)] hover:text-[var(--ink)] [&>svg]:size-4"
            >
              <ChevronIcon direction="end" className="rtl:rotate-180" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
