"use client";

import { Link, useRevalidator } from "react-router";

import useEmblaCarousel from "embla-carousel-react";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { ProductEditor } from "@/components/live-edit/product-editor";
import { StoreImage } from "@/components/store/store-image";
import { ArrowIcon, ChevronIcon, CloseIcon, PauseIcon, PencilIcon, PlayIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";
import type { AdminMessages } from "@/i18n/messages";
import type { StoreProduct } from "@/lib/catalog/product-mapper";
import { resolveImageSource } from "@/lib/images";
import { cn } from "@/lib/cn";
import { formatMessage } from "@/i18n/format";
import { reorderCarouselProducts } from "@/lib/admin-actions";

/** Combined Embla state to avoid three separate re-renders per slide change. */
type EmblaState = { selected: number; canPrev: boolean; canNext: boolean };

/** Configured featured products, with accessible rotation and RTL gestures. */
export type HeroCarouselProps = {
  products: StoreProduct[];
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
    goToProduct: string;
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

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void): () => void {
  const media = window.matchMedia(REDUCED_MOTION_QUERY);
  media.addEventListener("change", onChange);

  return () => media.removeEventListener("change", onChange);
}

export function HeroCarousel({
  products,
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
  const total = products.length;
  const rotating = autoplay && total > 1;
  const { revalidate } = useRevalidator();

  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop,
    align,
    direction: locale === "ar" ? "rtl" : "ltr",
    containScroll: false,
    dragFree: false,
  });

  const [emblaState, setEmblaState] = useState<EmblaState>({ selected: 0, canPrev: false, canNext: false });

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
  const [tabHidden, setTabHidden] = useState(false);
  const paused = userPaused ?? reducedMotion;

  /* Carousel reorder mode (admin only) — shows up/down arrows on thumbnails. */
  const [reorderMode, setReorderMode] = useState(false);

  /*
   * Watch tab visibility to pause rotation when document is hidden.
   */
  useEffect(() => {
    function onVisibilityChange() {
      setTabHidden(document.hidden);
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  /*
   * Native robust autoplay timer: advances the carousel without any embla plugin
   * lifecycle / internalEngine race conditions.
   */
  useEffect(() => {
    if (!emblaApi || !rotating || paused || tabHidden) {
      return;
    }

    const intervalMs = Math.max(2, intervalSeconds) * 1000;
    const timer = setInterval(() => {
      if (!emblaApi) return;
      if (emblaApi.canScrollNext()) {
        emblaApi.scrollNext();
      } else {
        emblaApi.scrollTo(0);
      }
    }, intervalMs);

    return () => clearInterval(timer);
  }, [emblaApi, rotating, paused, tabHidden, intervalSeconds]);

  const toggleRotation = useCallback(() => {
    setUserPaused(!paused);
  }, [paused]);

  const onSelect = useCallback(() => {
    if (emblaApi) {
      setEmblaState({
        selected: emblaApi.selectedScrollSnap(),
        canPrev: emblaApi.canScrollPrev(),
        canNext: emblaApi.canScrollNext(),
      });
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

  /*
   * Reorder functions — swap two adjacent products in the carousel.
   * Calls the server action to persist the new order, then refreshes
   * the page so the component re-renders with the updated order.
   */
  const moveProduct = useCallback(
    async (fromIndex: number, direction: "left" | "right") => {
      const toIndex = direction === "left" ? fromIndex - 1 : fromIndex + 1;
      if (toIndex < 0 || toIndex >= total) return;

      const fromId = products[fromIndex].id;
      const toId = products[toIndex].id;

      const result = await reorderCarouselProducts(fromId, toId);
      if (result.success) {
        void revalidate();
      }
    },
    [products, total, revalidate],
  );

  if (total === 0) {
    return null;
  }

  const { selected, canPrev, canNext } = emblaState;

  return (
    <section className={cn("sf-featured", className)} aria-roledescription="carousel"
      aria-label={labels.regionLabel} aria-live={rotating && !paused ? "off" : "polite"}>
      <div className="sf-featured-main">
        <div ref={emblaRef} className="gh-sheen sf-featured-viewport">
          <div className="sf-featured-track">
            {products.map((product, index) => {
              const active = index === selected;
              return (
                <div key={product.id} className="sf-featured-slide" role="group"
                  aria-roledescription="slide" aria-hidden={!active}
                  aria-label={formatMessage(labels.slideLabel, { index: index + 1, total }, locale)}>
                  <Link to={`/${locale}/${product.categorySlug}/${product.slug}`}
                    tabIndex={active ? undefined : -1} className="sf-featured-link">
                    <div className="sf-featured-art" data-aspect={imageAspect}>
                      <StoreImage src={product.imageUrl} alt={product.name} fit={imageFit}
                        focus={{x:imagePositionX,y:imagePositionY}} sizes="96px" />
                    </div>
                    <div className="sf-featured-copy">
                      <span className="sf-featured-label">{product.carouselBadge || labels.featured}</span>
                      <h3 dir="auto">{product.name}</h3>
                      {product.description ? <p>{product.description}</p> : null}
                    </div>
                    <span className="sf-featured-details">{labels.details}<ArrowIcon direction="end" className="size-4 rtl:rotate-180" /></span>
                  </Link>
                  {liveEdit && active ? <div className="sf-featured-edit"><ProductEditor
                    gameId={product.id} gameSlug={product.slug} label={product.name} locale={locale} messages={liveEdit}/></div> : null}
                </div>
              );
            })}
          </div>
        </div>
        {total > 1 ? <div className="sf-featured-controls">
          <button type="button" onClick={()=>emblaApi?.scrollPrev()} disabled={!canPrev} aria-label={labels.previous}><ArrowIcon direction="start" className="size-4 rtl:rotate-180"/></button>
          {rotating ? <button type="button" onClick={toggleRotation} aria-label={paused?labels.play:labels.pause} aria-pressed={paused}>{paused?<PlayIcon className="size-4"/>:<PauseIcon className="size-4"/>}</button> : null}
          <button type="button" onClick={()=>emblaApi?.scrollNext()} disabled={!canNext} aria-label={labels.next}><ArrowIcon direction="end" className="size-4 rtl:rotate-180"/></button>
        </div> : null}
      </div>
      {total > 1 ? <div className="sf-featured-tabs" role="group" aria-label={labels.regionLabel}>
        {products.map((product,index)=><div key={product.id} className="sf-featured-tab-wrap">
          <button type="button" onClick={()=>emblaApi?.scrollTo(index)} aria-current={index===selected?"true":undefined}
            aria-label={formatMessage(labels.goToProduct,{name:product.name},locale)} className="sf-featured-tab">
            <img src={resolveImageSource(product.logoUrl||product.imageUrl,128)??undefined} data-logo-image={product.logoUrl ? "true" : undefined} data-logo-tone={product.logoUrl ? product.carouselLogoTone : undefined} data-logo-source={/^https?:\/\/cdn\.simpleicons\.org\//i.test(product.logoUrl || product.imageUrl || "") ? "simpleicons" : undefined} alt="" loading="lazy" decoding="async" />
            <span dir="auto">{product.name}</span>
          </button>
          {reorderMode ? <div className="sf-featured-reorder">
            <button type="button" disabled={index===0} onClick={()=>moveProduct(index,"left")} aria-label={locale==="ar"?"تحريك للخلف":"Move earlier"}><ChevronIcon direction="start" className="size-4"/></button>
            <button type="button" disabled={index===total-1} onClick={()=>moveProduct(index,"right")} aria-label={locale==="ar"?"تحريك للأمام":"Move later"}><ChevronIcon direction="end" className="size-4"/></button>
          </div> : null}
        </div>)}
        {liveEdit ? <button type="button" onClick={()=>setReorderMode(value=>!value)} aria-pressed={reorderMode}
          aria-label={reorderMode?(locale==="ar"?"إنهاء الترتيب":"Done reordering"):(locale==="ar"?"ترتيب المنتجات المميزة":"Reorder featured products")} className="sf-featured-edit-toggle">
          {reorderMode?<CloseIcon className="size-4"/>:<PencilIcon className="size-4"/>}
        </button>:null}
      </div>:null}
    </section>
  );
}
