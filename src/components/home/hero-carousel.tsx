"use client";

import Link from "next/link";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { GameEditor } from "@/components/live-edit/game-editor";
import { StoreImage } from "@/components/store/store-image";
import { Badge } from "@/components/ui/badge";
import { ArrowIcon, PauseIcon, PlayIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";
import type { AdminMessages } from "@/i18n/messages";
import type { StoreGame } from "@/lib/catalog/game-mapper";
import { cn } from "@/lib/cn";
import { formatMessage } from "@/i18n/format";

/**
 * Featured games carousel, on Embla.
 *
 * A cinematic hero rather than a card: the artwork bleeds to the frame, a
 * strong canvas wash rises from the bottom for the caption, and the game's
 * name is set large enough to lead the page. Motion is a slow Ken Burns zoom
 * on the active slide and a caption that rises into place.
 *
 * **Arabic.** `direction` is passed to Embla rather than left to CSS. It is not
 * a styling concern here — Embla measures slide offsets and decides which way a
 * drag advances, so an RTL document with an LTR carousel drags backwards. With
 * the option set, slide 1 is the rightmost and dragging left still means "next"
 * in reading order.
 *
 * **Rotation and its off switch.** The strip advances by itself because the
 * owner's storefront sells the featured games by moving them, but an advancing
 * frame can outrun a reader, so control is served three ways: a pause/play
 * button beside the progress rail; a stop while the tab is hidden, resuming
 * only if the visitor had not paused it themselves; and a paused start for a
 * visitor whose OS asks for reduced motion, who can still press play. While
 * paused the region turns into a polite live region, so a manual slide change
 * is announced instead of sliding by unheard.
 *
 * **Reduced motion.** The global `prefers-reduced-motion` rule collapses the
 * zoom and the progress fill for a visitor who asks for less motion. Combined
 * with the paused start, the strip sits still until they ask it to move.
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
  /** Rotation, always on for a strip with more than one slide. */
  autoplay?: boolean;
  loop?: boolean;
  align?: "start" | "center";
  imageFit?: "cover" | "contain";
  imageAspect?: "auto" | "16:9" | "4:3" | "1:1";
  imagePositionX?: number;
  imagePositionY?: number;
  labels: {
    regionLabel: string;
    slideLabel: string;
    goToGame: string;
    previous: string;
    next: string;
    pause: string;
    play: string;
    details: string;
    featured: string;
  };
  /** Present only for an administrator; turns the per-slide edit pencil on. */
  liveEdit?: AdminMessages["liveEdit"] | null;
  className?: string;
};

/** Zero-padded two-digit number for the editorial counter, e.g. `01`. */
function padTwo(value: number): string {
  return String(value).padStart(2, "0");
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void): () => void {
  const media = window.matchMedia(REDUCED_MOTION_QUERY);
  media.addEventListener("change", onChange);

  return () => media.removeEventListener("change", onChange);
}

export function HeroCarousel({
  games,
  locale,
  intervalSeconds,
  autoplay = true,
  loop = true,
  align = "center",
  imageFit = "cover",
  imageAspect = "auto",
  imagePositionX = 50,
  imagePositionY = 50,
  labels,
  liveEdit,
  className,
}: HeroCarouselProps) {
  const total = games.length;
  const rotating = autoplay && total > 1;

  /*
   * Rebuilt only when a decision changes, never per render: handing Embla a new
   * plugin array on every render tears the carousel down mid-drag.
   *
   * The instance is kept so the pause button can stop and resume the timer
   * without rebuilding — `stop()` freezes where the countdown is, `play()`
   * continues it, and the drag behaviour is untouched either way.
   */
  const autoplayPlugin = useMemo(
    () =>
      rotating
        ? Autoplay({
            delay: Math.max(2, intervalSeconds) * 1000,
            /*
             * The carousel advances no matter what the visitor is doing. The
             * default stops — an interaction, hover, focus — let a frame that
             * is being read sit still, but they also read as "it only moves
             * when I am not looking", and the storefront needs the featured
             * games to sell themselves. The progress rail keeps the next swap
             * visible and the pause button hands control to a visitor who
             * wants it.
             */
            stopOnInteraction: false,
          })
        : null,
    [rotating, intervalSeconds],
  );

  const plugins = useMemo(() => (autoplayPlugin ? [autoplayPlugin] : []), [autoplayPlugin]);

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
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  /*
   * Rotation state, read reactively. `reducedMotion` comes through a store
   * subscription rather than an effect-written flag, so the OS preference —
   * including a mid-session change — just is the state. `userPaused` is the
   * visitor's explicit choice, and `null` means they have not made one yet:
   * an untouched strip follows the OS (reduced motion starts paused), and one
   * press of the button overrides either from then on.
   */
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false,
  );
  const [userPaused, setUserPaused] = useState<boolean | null>(null);
  const paused = userPaused ?? reducedMotion;

  /*
   * The plugin is an external system, so the effect's job is exactly to keep
   * it in step with the state: paused stops the timer where it is, unpausing
   * resumes it.
   */
  useEffect(() => {
    if (!autoplayPlugin) {
      return;
    }

    if (paused) {
      autoplayPlugin.stop();
    } else {
      autoplayPlugin.play();
    }
  }, [autoplayPlugin, paused]);

  /*
   * A hidden tab has no audience; stop the timer and only resume it for a
   * visitor who had not paused the strip themselves.
   */
  useEffect(() => {
    if (!autoplayPlugin) {
      return;
    }

    function onVisibilityChange() {
      if (document.hidden) {
        autoplayPlugin?.stop();
      } else if (!paused) {
        autoplayPlugin?.play();
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [autoplayPlugin, paused]);

  const toggleRotation = useCallback(() => {
    setUserPaused(!paused);
  }, [paused]);

  const onSelect = useCallback(() => {
    if (emblaApi) {
      setSelected(emblaApi.selectedScrollSnap());
      setCanPrev(emblaApi.canScrollPrev());
      setCanNext(emblaApi.canScrollNext());
    }
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) {
      return;
    }

    /*
     * All three events, and `init` is the one that matters. Embla emits `init`
     * when it first activates and `reInit` only when it is re-activated — a
     * change of options, of plugins, or a media query it was given. Subscribing
     * to `reInit` alone therefore seeds nothing on a normal page load, which is
     * how the arrows came to be gated on a value that stayed empty forever and
     * never rendered at all. `init` arrives on a `setTimeout(0)` scheduled
     * while the library is being constructed, so this subscription is in place
     * long before it fires.
     *
     * `reInit` still matters: the selected index can move when the slides or
     * the options change under us.
     */
    emblaApi.on("init", onSelect);
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);

    return () => {
      emblaApi.off("init", onSelect);
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onSelect);
    };
  }, [emblaApi, onSelect]);

  if (total === 0) {
    return null;
  }

  /*
   * Editorial counter, e.g. `01 / 05`. The brand face (Tektur) gives the row a
   * numeral character the Geist body cannot, and the width is tabular so a
   * tenth game does not nudge the digits.
   */
  const counter = (
    <span className="hidden flex-none items-baseline gap-2 font-brand text-sm tracking-[0.22em] text-[var(--ink-soft)] tabular-nums sm:inline-flex" aria-hidden="true">
      <span className="text-base text-[var(--ink)]">{padTwo(selected + 1)}</span>
      <span className="text-[var(--ink-faint)]">{padTwo(total)}</span>
    </span>
  );

  return (
    <section
      className={cn("relative", className)}
      aria-roledescription="carousel"
      aria-label={labels.regionLabel}
      /*
       * While rotating, a live region would re-announce the slide every few
       * seconds; while paused it is exactly what a reader wants. The APG
       * carousel pattern is the source for both halves of this rule.
       */
      aria-live={rotating && !paused ? "off" : "polite"}
    >
      <div className="relative overflow-hidden rounded-[var(--radius-shell)] border border-[var(--line)] bg-[var(--shell)] p-1.5 shadow-[var(--elevation-2)] backdrop-blur-xl">
        {/*
          * The viewport clips; the container is the flex track Embla moves.
          * Tall on a phone, wide on a desktop — one game should never be
          * several screens tall on a laptop or a letterbox on a phone.
          */}
        <div
          ref={emblaRef}
          className={cn(
            "gh-sheen relative overflow-hidden rounded-[var(--radius-inner)] border border-[var(--line)] bg-[var(--surface-inset)]",
            imageAspect === "16:9" && "aspect-video",
            imageAspect === "4:3" && "aspect-[4/3]",
            imageAspect === "1:1" && "aspect-square",
            imageAspect === "auto" && "aspect-[4/5] sm:aspect-[16/9] lg:aspect-[2.4/1]",
          )}
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
                    {/*
                      * The artwork itself, framed at 4:3 and centred. A square
                      * upload shown whole leaves wide margins on a landscape
                      * frame, and shown cover-cropped it loses the icon — 4:3
                      * is the middle: most of the image, a natural crop, and a
                      * quiet theme-coloured band either side where the frame
                      * is wider than the box.
                      */}
                    <div className="absolute inset-0 grid place-items-center">
                      <div className="aspect-[4/3] h-full max-w-full">
                        <StoreImage
                          src={game.imageUrl}
                          alt={game.name}
                          priority={slideIndex === 0}
                          sizes="(min-width: 1280px) 1280px, (min-width: 640px) 92vw, 100vw"
                          fit={imageFit}
                          focus={{ x: imagePositionX, y: imagePositionY }}
                          className="drop-shadow-[0_18px_48px_rgba(0,0,0,0.35)]"
                        />
                      </div>
                    </div>

                    {/*
                      * The cinematic wash. Two layers: a canvas gradient rising
                      * from the bottom so the caption always sits on a field the
                      * theme knows, and a soft accent bloom cornered opposite
                      * the text so the top of the frame is not flat. The bottom
                      * is deliberately deep — the caption is what sells the
                      * slide, and it must win against a busy artwork.
                      */}
                    <div
                      aria-hidden="true"
                      className="absolute inset-0 bg-[linear-gradient(to_top,color-mix(in_srgb,var(--canvas)_97%,transparent)_0%,color-mix(in_srgb,var(--canvas)_82%,transparent)_28%,color-mix(in_srgb,var(--canvas)_38%,transparent)_58%,transparent_78%),radial-gradient(70% 90% at 90% 8%,color-mix(in_srgb,var(--accent)_18%,transparent),transparent_64%)]"
                    />

                    {/*
                      * The caption. Capped so the copy does not run the width of
                      * a wide screen, and rising into place on the active slide
                      * so a new game announces itself instead of appearing.
                      */}
                    <div className="absolute inset-x-0 bottom-0 max-w-3xl p-5 sm:p-8 lg:p-12">
                      <div className={cn(isActive && "gh-rise")}>
                        <div className="flex flex-wrap items-center gap-2">
                          {game.carouselBadge ? (
                            <Badge tone="accent">{game.carouselBadge}</Badge>
                          ) : game.isFeatured ? (
                            <Badge tone="accent">{labels.featured}</Badge>
                          ) : null}
                          {game.pointsName ? <Badge tone="neutral">{game.pointsName}</Badge> : null}
                        </div>

                        <h3 className="mt-4 max-w-[18ch] text-[clamp(2rem,4.5vw,4.25rem)] leading-[1.04] font-semibold tracking-[-0.04em] text-[var(--ink)] [text-shadow:0_2px_18px_rgba(0,0,0,0.45)]">
                          {game.name}
                        </h3>

                        {game.description ? (
                          <p className="mt-3 line-clamp-2 max-w-xl text-sm leading-7 text-[var(--ink-soft)] [text-shadow:0_1px_8px_rgba(0,0,0,0.4)] sm:text-base">
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
                        <span className="mt-6 inline-flex min-h-13 items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--accent)] ps-6 pe-1.5 text-sm font-semibold text-[var(--accent-ink)] shadow-[var(--elevation-1)] transition-colors duration-[var(--duration)] group-hover:bg-[var(--accent-strong)] sm:min-h-11">
                          {labels.details}
                          <span className="grid size-9 place-items-center rounded-full bg-[color-mix(in_srgb,var(--accent-ink)_14%,transparent)] transition-transform duration-[var(--duration)] ease-[var(--ease-spring)] group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5">
                            <ArrowIcon direction="end" className="size-4 rtl:rotate-180" />
                          </span>
                        </span>
                      </div>
                    </div>
                  </Link>

                  {/*
                    * Beside the link rather than inside it, for the reason the
                    * details pill became a span: one link per slide. Only the
                    * slide in view carries one, so a pencil cannot be tabbed to
                    * on a slide nobody can see.
                    */}
                  {liveEdit && isActive ? (
                    <div className="absolute top-4 start-4 z-10">
                      <GameEditor
                        gameId={game.id}
                        gameSlug={game.slug}
                        label={game.name}
                        locale={locale}
                        messages={liveEdit}
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        {/*
          * Editorial counter in the corner of the frame, and the arrows for a
          * pointer and only for a pointer. A phone drags the slide and has no
          * room to spare; a mouse has no drag habit and nothing else to click.
          * `pointer:fine` is the honest test for that — a narrow window on a
          * laptop still gets them, and a large tablet does not.
          *
          * The arrows sit outside the element handed to Embla, as the library
          * requires: the viewport responds to pointer events, and a click
          * landing inside it can be read as the start of a drag.
          *
          * The icons follow reading order rather than the screen, so in Arabic
          * "next" points left — the same `rtl:rotate-180` rule every other
          * directional icon in this codebase uses.
          */}
        {total > 1 ? (
          <>
            <div className="pointer-events-none absolute end-4 top-4 z-10 sm:end-6 sm:top-6">
              {counter}
            </div>

            <div className="pointer-events-none absolute inset-x-0 top-1/2 hidden -translate-y-1/2 justify-between px-4 [@media(pointer:fine)]:flex">
              <button
                type="button"
                onClick={() => emblaApi?.scrollPrev()}
                disabled={!canPrev}
                aria-label={labels.previous}
                className="pointer-events-auto grid size-12 place-items-center rounded-full border border-[var(--line)] bg-[color-mix(in_srgb,var(--shell)_78%,transparent)] text-[var(--ink-soft)] shadow-[var(--elevation-1)] backdrop-blur-md transition-[border-color,color,transform] duration-[var(--duration)] hover:border-[var(--line-strong)] hover:text-[var(--ink)] hover:-translate-x-0.5 rtl:hover:translate-x-0.5 disabled:opacity-30"
              >
                <ArrowIcon direction="start" className="size-4 rtl:rotate-180" />
              </button>

              <button
                type="button"
                onClick={() => emblaApi?.scrollNext()}
                disabled={!canNext}
                aria-label={labels.next}
                className="pointer-events-auto grid size-12 place-items-center rounded-full border border-[var(--line)] bg-[color-mix(in_srgb,var(--shell)_78%,transparent)] text-[var(--ink-soft)] shadow-[var(--elevation-1)] backdrop-blur-md transition-[border-color,color,transform] duration-[var(--duration)] hover:border-[var(--line-strong)] hover:text-[var(--ink)] hover:translate-x-0.5 rtl:hover:-translate-x-0.5 disabled:opacity-30"
              >
                <ArrowIcon direction="end" className="size-4 rtl:rotate-180" />
              </button>
            </div>
          </>
        ) : null}
      </div>

      {/*
        * Position markers as a segmented progress rail — one segment per game,
        * and the active one is both the marker and the countdown to the next:
        * it fills over `intervalSeconds` while rotation runs, and a segment is
        * the keyboard-reachable way to jump to a slide, so the button is the
        * target and carries the name.
        *
        * Every segment gets a `key` that turns the fill into a new element each
        * time it activates, which is what restarts the `gh-progress` animation
        * in step with Embla's own timer.
        */}
      {total > 1 ? (
        <div className="mt-4 flex items-center gap-4 sm:mt-5">
          {/*
            * The pause/play control, at the thumb end of the progress rail. The
            * icon shows the action, not the state, so a paused strip offers the
            * play glyph — and the accessible label follows the action too.
            */}
          {rotating ? (
            <button
              type="button"
              onClick={toggleRotation}
              aria-label={paused ? labels.play : labels.pause}
              aria-pressed={paused}
              className="grid size-10 shrink-0 place-items-center rounded-full border border-[var(--line)] bg-[var(--surface)] text-[var(--ink-soft)] shadow-[var(--elevation-1)] transition-colors duration-[var(--duration)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
            >
              {paused ? <PlayIcon className="size-4" /> : <PauseIcon className="size-4" />}
            </button>
          ) : null}

          <div
            className="flex flex-1 items-center gap-1.5"
            role="group"
            aria-label={labels.regionLabel}
          >
            {games.map((game, slideIndex) => {
              const isActive = slideIndex === selected;

              return (
                <button
                  key={game.id}
                  type="button"
                  onClick={() => emblaApi?.scrollTo(slideIndex)}
                  aria-label={formatMessage(labels.goToGame, { name: game.name }, locale)}
                  aria-current={isActive ? "true" : undefined}
                  className="group/seg h-1.5 flex-1 cursor-pointer overflow-hidden rounded-full bg-[var(--surface-inset)] transition-colors duration-[var(--duration)] hover:bg-[var(--line)] focus-visible:bg-[var(--line-strong)]"
                >
                  <span
                    key={isActive ? `active:${selected}:${paused}` : `idle:${slideIndex}`}
                    className={cn(
                      "block h-full w-full origin-left rounded-full bg-[var(--accent)] rtl:origin-right",
                      isActive ? (rotating && !paused ? "gh-progress" : "scale-x-100") : "scale-x-0",
                    )}
                    style={
                      isActive && rotating && !paused
                        ? { animationDuration: `${Math.max(2, intervalSeconds)}s` }
                        : undefined
                    }
                  />
                </button>
              );
            })}
          </div>

          {counter}
        </div>
      ) : null}
    </section>
  );
}