"use client";

import Link from "next/link";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { StoreImage } from "@/components/store/store-image";
import { Badge } from "@/components/ui/badge";
import { ArrowIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";
import type { StoreGame } from "@/lib/catalog/game-mapper";
import { cn } from "@/lib/cn";
import { formatMessage } from "@/i18n/messages";

/**
 * Featured games carousel, on Embla.
 *
 * The hand-rolled version cross-faded between absolutely-positioned slides and
 * carried its own swipe detection, its own rotation timer, and its own pause
 * rules. All three were reimplementations of things this library does properly:
 * a drag that tracks the finger and settles with momentum rather than snapping
 * after a 44px threshold, a wheel and trackpad gesture, and rotation that stops
 * the moment somebody touches it.
 *
 * **Arabic.** `direction` is passed to Embla rather than left to CSS. It is not
 * a styling concern here — Embla measures slide offsets and decides which way a
 * drag advances, so an RTL document with an LTR carousel drags backwards. With
 * the option set, slide 1 is the rightmost and dragging left still means "next"
 * in reading order.
 *
 * **Reduced motion.** Autoplay is not registered at all when the visitor asks
 * for less motion, rather than registered and paused: a plugin that exists can
 * be started by a stray interaction, and the setting is a statement about what
 * the page may do rather than what it may do right now.
 *
 * The APG carousel semantics are kept — a labelled group with
 * `aria-roledescription="carousel"`, one slide per view, dots that report
 * position — because Embla supplies gestures, not meaning.
 */
export type HeroCarouselProps = {
  games: StoreGame[];
  locale: Locale;
  intervalSeconds: number;
  /** Rotation, off regardless when the visitor prefers reduced motion. */
  autoplay?: boolean;
  loop?: boolean;
  align?: "start" | "center";
  labels: {
    regionLabel: string;
    slideLabel: string;
    goToSlide: string;
    details: string;
    featured: string;
  };
  className?: string;
};

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/**
 * Matches the media query the rest of the design system honours.
 *
 * `useSyncExternalStore` rather than state written from an effect: the browser
 * already holds this value, so it is subscribed to rather than copied. The
 * server snapshot is `false`, which keeps both render passes identical — and a
 * carousel that arrives still and then starts is better than one that arrives
 * moving and has to be stopped.
 */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(REDUCED_MOTION);

      query.addEventListener("change", onChange);

      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
}

export function HeroCarousel({
  games,
  locale,
  intervalSeconds,
  autoplay = true,
  loop = true,
  align = "center",
  labels,
  className,
}: HeroCarouselProps) {
  const total = games.length;
  const reducedMotion = usePrefersReducedMotion();
  const rotating = autoplay && !reducedMotion && total > 1;

  /*
   * Rebuilt only when a decision changes, never per render: handing Embla a new
   * plugin array on every render tears the carousel down mid-drag.
   */
  const plugins = useMemo(
    () =>
      rotating
        ? [
            Autoplay({
              delay: Math.max(2, intervalSeconds) * 1000,
              // A visitor who has taken hold of it is reading, not waiting.
              stopOnInteraction: true,
              stopOnMouseEnter: true,
              stopOnFocusIn: true,
            }),
          ]
        : [],
    [rotating, intervalSeconds],
  );

  const [emblaRef, emblaApi] = useEmblaCarousel(
    {
      loop,
      align,
      direction: locale === "ar" ? "rtl" : "ltr",
      // One game fills the frame, so there is never a partial slide to trim.
      containScroll: false,
      // A slide is a destination, not a shelf to flick through.
      dragFree: false,
    },
    plugins,
  );

  const [selected, setSelected] = useState(0);

  const onSelect = useCallback(() => {
    if (emblaApi) {
      setSelected(emblaApi.selectedScrollSnap());
    }
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) {
      return;
    }

    emblaApi.on("select", onSelect);
    /*
     * `reInit` fires when the slide list or the options change, and the selected
     * index can move under us when it does. Both are subscriptions rather than a
     * read on mount: the initial index is Embla's own `startIndex`, which is 0,
     * and that is what this state already holds.
     */
    emblaApi.on("reInit", onSelect);

    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onSelect);
    };
  }, [emblaApi, onSelect]);

  if (total === 0) {
    return null;
  }

  return (
    <section
      className={cn("relative", className)}
      aria-roledescription="carousel"
      aria-label={labels.regionLabel}
    >
      <div className="rounded-[var(--radius-shell)] border border-[var(--line)] bg-[var(--shell)] p-1.5 backdrop-blur-xl">
        {/*
          * The viewport clips; the container is the flex track Embla moves.
          * Portrait on a phone, wide on a desktop — one game should never be
          * several screens tall on a laptop or a letterbox on a phone.
          */}
        <div
          ref={emblaRef}
          className="gh-sheen relative aspect-[4/5] overflow-hidden rounded-[var(--radius-inner)] border border-[var(--line)] bg-[var(--surface-inset)] sm:aspect-[16/10] lg:aspect-[21/9]"
        >
          {/* `touch-action` keeps a vertical scroll the page's, not the carousel's. */}
          <div className="flex h-full touch-pan-y">
            {games.map((game, slideIndex) => {
              const isActive = slideIndex === selected;

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
                  // `min-w-0` is required: without it a flex item refuses to
                  // shrink below its content and every slide overflows.
                  className="relative min-w-0 shrink-0 grow-0 basis-full"
                >
                  <StoreImage
                    src={game.imageUrl}
                    alt={game.name}
                    focus={game.carouselFocus}
                    priority={slideIndex === 0}
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
                      // Off the tab order while off-screen: a keyboard reader
                      // should not tab into a slide nobody can see.
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
      </div>

      {/*
        * Dots only. On a phone the slide is dragged and on a pointer it is
        * hovered, which stops rotation anyway — arrows and a pause button were
        * chrome that earned nothing. The dots stay because they say how many
        * slides there are, which nothing else does, and they remain the
        * keyboard-reachable way to jump.
        */}
      {total > 1 ? (
        <div className="mt-3 flex items-center justify-center sm:mt-4">
          <ul className="flex items-center" role="list">
            {games.map((game, slideIndex) => (
              <li key={game.id}>
                {/*
                  * The bar is 6px tall; the button around it is 44, the smallest
                  * thing a thumb should be asked to hit. The padding is the
                  * target — shrinking it to fit the visual would make these
                  * unusable on the device most people arrive on.
                  */}
                <button
                  type="button"
                  onClick={() => emblaApi?.scrollTo(slideIndex)}
                  aria-label={formatMessage(labels.goToSlide, { index: slideIndex + 1 }, locale)}
                  aria-current={slideIndex === selected ? "true" : undefined}
                  className="grid h-11 place-items-center px-1"
                >
                  <span
                    className={cn(
                      "block h-1.5 rounded-full transition-[width,background-color] duration-[var(--duration)] ease-[var(--ease-spring)]",
                      slideIndex === selected
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
    </section>
  );
}
