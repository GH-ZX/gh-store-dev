"use client";

import Link from "next/link";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
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
 * **The whole slide is the link.** A picture of a game with a title on it reads
 * as something to press, on a phone especially, and asking for the small pill
 * instead is a rule only the person who built it knows. Embla suppresses the
 * click that ends a drag — it watches its own root in the capture phase and
 * stops any click that travelled further than the drag threshold — so a swipe
 * cannot navigate by accident and the guard needs nothing from this file.
 *
 * The APG carousel semantics are kept — a labelled group with
 * `aria-roledescription="carousel"`, one slide per view, position markers —
 * because Embla supplies gestures, not meaning.
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
    goToGame: string;
    previous: string;
    next: string;
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
  /*
   * One entry per snap, which is not always one per slide — `scrollSnapList` is
   * the only thing that knows, and it is what the library's own dot guide uses.
   * Mapping the games array instead would silently render the wrong number of
   * dots the day this groups slides.
   */
  const [snaps, setSnaps] = useState<number[]>([]);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const stripRef = useRef<HTMLDivElement | null>(null);

  const onSelect = useCallback(() => {
    if (emblaApi) {
      setSelected(emblaApi.selectedScrollSnap());
      setCanPrev(emblaApi.canScrollPrev());
      setCanNext(emblaApi.canScrollNext());
    }
  }, [emblaApi]);

  const onReInit = useCallback(() => {
    if (emblaApi) {
      setSnaps(emblaApi.scrollSnapList());
      onSelect();
    }
  }, [emblaApi, onSelect]);

  useEffect(() => {
    if (!emblaApi) {
      return;
    }

    /*
     * Embla emits `reInit` once on init, so subscribing is enough to seed the
     * snap list and the selected index — no read on mount, which is what kept
     * this component free of state written from an effect.
     *
     * `reInit` also fires when the slides or the options change, and both the
     * snap list and the selected index can move under us when they do.
     */
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onReInit);

    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onReInit);
    };
  }, [emblaApi, onSelect, onReInit]);

  /*
   * Keeps the current game's logo inside the strip when the strip is long
   * enough to scroll — otherwise rotation walks the marker off the edge and the
   * row stops saying where you are.
   *
   * Scrolls the strip itself rather than calling `scrollIntoView`, which is
   * allowed to scroll every ancestor including the page: pulling the document
   * around while somebody is reading, on a timer, would be worse than a marker
   * out of sight. The offset is a difference between two measured positions, so
   * it is correct in Arabic without caring which end `scrollLeft` counts from.
   */
  useEffect(() => {
    const strip = stripRef.current;
    const marker = strip?.firstElementChild?.children[selected];

    if (!strip || !(marker instanceof HTMLElement) || strip.scrollWidth <= strip.clientWidth + 1) {
      return;
    }

    const stripBox = strip.getBoundingClientRect();
    const markerBox = marker.getBoundingClientRect();

    strip.scrollBy({
      left: markerBox.left - stripBox.left - (stripBox.width - markerBox.width) / 2,
      behavior: reducedMotion ? "auto" : "smooth",
    });
  }, [selected, total, reducedMotion]);

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
                  // Every slide is in the DOM side by side, so the ones nobody
                  // can see have to be hidden from a screen reader explicitly —
                  // otherwise the page reads out all of them in a row.
                  aria-hidden={!isActive}
                  // `min-w-0` is required: without it a flex item refuses to
                  // shrink below its content and every slide overflows.
                  className="relative min-w-0 shrink-0 grow-0 basis-full"
                >
                  <Link
                    href={`/${locale}/games/${game.slug}`}
                    // Off the tab order while off-screen: a keyboard reader
                    // should not tab into a slide nobody can see.
                    tabIndex={isActive ? undefined : -1}
                    // Positioned rather than `size-full`: a percentage height
                    // needs a parent with a definite one, and a stretched flex
                    // item does not reliably give the artwork inside it that.
                    className="group absolute inset-0"
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

                      {/*
                        * A span, not a link: the slide around it already goes
                        * to the game, and a link inside a link is invalid HTML
                        * that browsers repair by guessing. It keeps the pill
                        * shape because that is what says "this is pressable" at
                        * a glance, and it reacts to hover on the whole slide.
                        */}
                      <span className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--accent)] ps-5 pe-1.5 text-sm font-semibold text-[var(--accent-ink)] transition-colors duration-[var(--duration)] group-hover:bg-[var(--accent-strong)] sm:min-h-11">
                        {labels.details}
                        <span className="grid size-8 place-items-center rounded-full bg-[color-mix(in_srgb,var(--accent-ink)_14%,transparent)] transition-transform duration-[var(--duration)] ease-[var(--ease-spring)] group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5">
                          <ArrowIcon direction="end" className="size-4 rtl:rotate-180" />
                        </span>
                      </span>
                    </div>
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/*
        * Arrows for a pointer, and only for a pointer. A phone drags the slide
        * and has no room to spare; a mouse has no drag habit and nothing else to
        * click. `pointer:fine` is the honest test for that — a narrow window on
        * a laptop still gets them, and a large tablet does not.
        *
        * Outside the element handed to Embla, as the library requires: the
        * viewport responds to pointer events, and a click landing inside it can
        * be read as the start of a drag.
        *
        * The icons follow reading order rather than the screen, so in Arabic
        * "next" points left — the same `rtl:rotate-180` rule every other
        * directional icon in this codebase uses.
        */}
      {snaps.length > 1 ? (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 hidden -translate-y-1/2 justify-between px-3 [@media(pointer:fine)]:flex">
          <button
            type="button"
            onClick={() => emblaApi?.scrollPrev()}
            disabled={!canPrev}
            aria-label={labels.previous}
            className="pointer-events-auto grid size-11 place-items-center rounded-full border border-[var(--line)] bg-[color-mix(in_srgb,var(--shell)_82%,transparent)] text-[var(--ink-soft)] backdrop-blur-md transition-colors duration-[var(--duration)] hover:border-[var(--line-strong)] hover:text-[var(--ink)] disabled:opacity-30"
          >
            <ArrowIcon direction="start" className="size-4 rtl:rotate-180" />
          </button>

          <button
            type="button"
            onClick={() => emblaApi?.scrollNext()}
            disabled={!canNext}
            aria-label={labels.next}
            className="pointer-events-auto grid size-11 place-items-center rounded-full border border-[var(--line)] bg-[color-mix(in_srgb,var(--shell)_82%,transparent)] text-[var(--ink-soft)] backdrop-blur-md transition-colors duration-[var(--duration)] hover:border-[var(--line-strong)] hover:text-[var(--ink)] disabled:opacity-30"
          >
            <ArrowIcon direction="end" className="size-4 rtl:rotate-180" />
          </button>
        </div>
      ) : null}

      {/*
        * Position markers, as game logos rather than dots.
        *
        * A dot says "there are four of these and you are on the second", which
        * is a fact about a widget. A logo says which games are in there, so the
        * row doubles as a way to reach the one you came for — and a logo is
        * recognised faster than its name is read, in either language.
        *
        * They are the keyboard-reachable way to jump to a slide, so the button
        * is the target and carries the name; the artwork inside is decorative.
        *
        * One button per game rather than per snap, unlike the arrows above: the
        * row is a list of games to a visitor, and building it from the games
        * array is the only version that exists in the server-rendered HTML.
        * Waiting for Embla to report its snaps would leave the space empty on a
        * slow connection and then shove the page down when it filled. With one
        * slide in view and the default `slidesToScroll`, a game index is a snap
        * index, which is what `scrollTo` wants.
        */}
      {total > 1 ? (
        // Scrolls rather than wraps or shrinks: a store with a dozen featured
        // games would otherwise stack rows of logos above the fold on a phone.
        // `w-max` with auto margins centres the row while it fits and leaves it
        // flush once it overflows, which `justify-center` cannot do — that
        // clips the first items out of reach.
        <div ref={stripRef} className="mt-3 overflow-x-auto pb-1 sm:mt-4 [scrollbar-width:none]">
          <ul className="mx-auto flex w-max items-center gap-2" role="list">
            {games.map((game, slideIndex) => {
              const isActive = slideIndex === selected;

              return (
                <li key={game.id}>
                  <button
                    type="button"
                    onClick={() => emblaApi?.scrollTo(slideIndex)}
                    aria-label={formatMessage(labels.goToGame, { name: game.name }, locale)}
                    aria-current={isActive ? "true" : undefined}
                    className={cn(
                      // 44px square: the logo is the touch target rather than
                      // something small centred inside a larger one.
                      "relative size-11 overflow-hidden rounded-[var(--radius-control)] border bg-[var(--surface)] transition-[border-color,opacity,transform] duration-[var(--duration)] ease-[var(--ease-spring)] sm:size-12",
                      isActive
                        ? "border-[var(--accent)] opacity-100 ring-2 ring-[color-mix(in_srgb,var(--accent)_45%,transparent)]"
                        : "border-[var(--line)] opacity-55 hover:opacity-100",
                    )}
                  >
                    <StoreImage
                      // Falls back to the slide artwork: a game can reach the
                      // carousel without a logo, and an empty square would be
                      // indistinguishable from the next empty square.
                      src={game.logoUrl ?? game.imageUrl}
                      alt=""
                      sizes="3rem"
                      className="absolute inset-0"
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
