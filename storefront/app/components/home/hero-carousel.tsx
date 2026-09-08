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

/** Configured featured products, with accessible rotation and RTL gestures. */
export type HeroCarouselProps = {
  products: StoreProduct[];
  locale: Locale;
  intervalSeconds: number;
  /** Admin-configured rotation; focus, hover and reduced motion can pause it. */
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

function subscribeVisibility(onChange: () => void): () => void {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
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

  const subscribeEmbla = useCallback((notify: () => void) => {
    if (!emblaApi) return () => {};
    emblaApi.on("init", notify);
    emblaApi.on("select", notify);
    emblaApi.on("reInit", notify);
    return () => {
      emblaApi.off("init", notify);
      emblaApi.off("select", notify);
      emblaApi.off("reInit", notify);
    };
  }, [emblaApi]);
  // A primitive snapshot stays stable until Embla changes. Reading it when
  // subscribing also handles initialization that predates React's effects.
  const emblaSnapshot = useSyncExternalStore(
    subscribeEmbla,
    useCallback(() => `${emblaApi?.selectedScrollSnap() ?? 0}:${emblaApi?.canScrollPrev() ?? false}:${emblaApi?.canScrollNext() ?? false}`, [emblaApi]),
    () => "0:false:false",
  );
  const [selectedValue, previousValue, nextValue] = emblaSnapshot.split(":");
  const selected = Number(selectedValue);
  const canPrev = previousValue === "true";
  const canNext = nextValue === "true";

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
  const tabHidden = useSyncExternalStore(subscribeVisibility, () => document.hidden, () => false);
  const [hovered, setHovered] = useState(false);
  const paused = userPaused ?? reducedMotion;

  /* Carousel reorder mode (admin only) — shows up/down arrows on thumbnails. */
  const [reorderMode, setReorderMode] = useState(false);

  /*
   * Native robust autoplay timer: advances the carousel without any embla plugin
   * lifecycle / internalEngine race conditions.
   */
  useEffect(() => {
    if (!emblaApi || !rotating || paused || tabHidden || hovered) {
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
  }, [emblaApi, rotating, paused, tabHidden, hovered, intervalSeconds]);

  const toggleRotation = useCallback(() => {
    setUserPaused(!paused);
  }, [paused]);

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

  return (
    <section className={cn("sf-featured", className)} aria-roledescription="carousel"
      aria-label={labels.regionLabel} aria-live={rotating && !paused && !hovered && !tabHidden ? "off" : "polite"}
      onPointerEnter={(event) => { if (event.pointerType === "mouse") setHovered(true); }}
      onPointerLeave={() => setHovered(false)} onPointerCancel={() => setHovered(false)}
      onFocusCapture={(event) => {
        // Keep a focused product from rotating out of reach. The rotation
        // control remains an explicit choice to pause or resume.
        if (!(event.target instanceof Element) || !event.target.closest("[data-carousel-rotation]")) {
          setUserPaused(true);
        }
      }}>
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
          {rotating ? <button type="button" data-carousel-rotation onClick={toggleRotation} aria-label={paused?labels.play:labels.pause} aria-pressed={paused}>{paused?<PlayIcon className="pointer-events-none size-4"/>:<PauseIcon className="pointer-events-none size-4"/>}</button> : null}
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
