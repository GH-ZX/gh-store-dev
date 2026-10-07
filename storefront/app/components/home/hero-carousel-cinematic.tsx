"use client";

import { Link, useNavigate, useRevalidator } from "react-router";
import useEmblaCarousel from "embla-carousel-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ProductEditor } from "@/components/live-edit/product-editor";
import { StoreImage } from "@/components/store/store-image";
import { CarouselBrand } from "@/components/home/carousel-brand";
import {
  ArrowIcon,
  ChevronIcon,
  CloseIcon,
  GearIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  SparkIcon,
} from "@/components/ui/icons";
import { reorderCarouselProducts } from "@/lib/admin-actions";
import type { Locale } from "@/i18n/config";
import type { AdminMessages } from "@/i18n/messages";
import type { StoreProduct } from "@/lib/catalog/product-mapper";
import { formatPrice } from "@/lib/format/money";
import { cn } from "@/lib/cn";
import "@/styles/hero-carousel-cinematic.css";

export type CinematicCarouselProps = {
  products: StoreProduct[];
  locale: Locale;
  intervalSeconds?: number;
  autoplay?: boolean;
  loop?: boolean;
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
    fromPrice: string;
  };
  liveEdit?: AdminMessages["liveEdit"] | null;
  className?: string;
};

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const media = window.matchMedia(REDUCED_MOTION_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function subscribeVisibility(onChange: () => void): () => void {
  if (typeof document === "undefined") return () => {};
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

/**
 * Featured products strip.
 *
 * One slide in view. Autoplay is driven by the active dot's CSS animation: when
 * its fill finishes the carousel advances, so nothing re-renders on a timer and
 * pausing the animation pauses the rotation.
 */
export function HeroCarouselCinematic({
  products,
  locale,
  intervalSeconds = 6,
  autoplay = true,
  loop = true,
  labels,
  liveEdit,
  className,
}: CinematicCarouselProps) {
  const isRtl = locale === "ar";
  const total = products.length;
  const isRotating = autoplay && total > 1;
  const intervalMs = Math.max(3, intervalSeconds) * 1000;
  const navigate = useNavigate();
  const { revalidate } = useRevalidator();

  const [reorderMode, setReorderMode] = useState(false);
  const [isMoving, setIsMoving] = useState(false);

  const moveProduct = useCallback(
    async (fromIndex: number, toIndex: number) => {
      if (toIndex < 0 || toIndex >= total) return;
      setIsMoving(true);
      try {
        const result = await reorderCarouselProducts(products[fromIndex].id, products[toIndex].id);
        if (result.success) void revalidate();
      } catch (err) {
        console.error("Failed to reorder carousel products:", err);
      } finally {
        setIsMoving(false);
      }
    },
    [products, total, revalidate],
  );

  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop,
    align: "start",
    direction: isRtl ? "rtl" : "ltr",
    containScroll: loop ? false : "trimSnaps",
    duration: 30,
    dragThreshold: 8,
  });

  const subscribeEmbla = useCallback(
    (notify: () => void) => {
      if (!emblaApi) return () => {};
      emblaApi.on("init", notify);
      emblaApi.on("select", notify);
      emblaApi.on("reInit", notify);
      return () => {
        emblaApi.off("init", notify);
        emblaApi.off("select", notify);
        emblaApi.off("reInit", notify);
      };
    },
    [emblaApi],
  );

  const selectedIndex = useSyncExternalStore(
    subscribeEmbla,
    useCallback(() => emblaApi?.selectedScrollSnap() ?? 0, [emblaApi]),
    () => 0,
  );

  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    () => (typeof window !== "undefined" ? window.matchMedia(REDUCED_MOTION_QUERY).matches : false),
    () => false,
  );

  const tabHidden = useSyncExternalStore(
    subscribeVisibility,
    () => (typeof document !== "undefined" ? document.hidden : false),
    () => false,
  );

  const [userPaused, setUserPaused] = useState<boolean | null>(null);
  const [hovered, setHovered] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);
  const paused = userPaused ?? reducedMotion;
  const holding = paused || hovered || tabHidden || isInteracting;
  const isDraggingRef = useRef(false);

  // A drag freezes autoplay and keeps its trailing click from navigating.
  useEffect(() => {
    if (!emblaApi) return;
    let release: ReturnType<typeof setTimeout> | undefined;
    const onPointerDown = () => {
      isDraggingRef.current = false;
      setIsInteracting(true);
    };
    const onScroll = () => {
      isDraggingRef.current = true;
    };
    const onPointerUp = () => {
      release = setTimeout(() => setIsInteracting(false), 1200);
    };
    emblaApi.on("pointerDown", onPointerDown);
    emblaApi.on("scroll", onScroll);
    emblaApi.on("pointerUp", onPointerUp);
    return () => {
      if (release) clearTimeout(release);
      emblaApi.off("pointerDown", onPointerDown);
      emblaApi.off("scroll", onScroll);
      emblaApi.off("pointerUp", onPointerUp);
    };
  }, [emblaApi]);

  const advance = useCallback(() => {
    if (!emblaApi) return;
    if (emblaApi.canScrollNext()) emblaApi.scrollNext();
    else emblaApi.scrollTo(0);
  }, [emblaApi]);

  if (total === 0) return null;

  const activeProduct = products[selectedIndex] ?? products[0];
  const prevSide = isRtl ? "end" : "start";
  const nextSide = isRtl ? "start" : "end";

  return (
    <section
      className={cn("cinematic-hero", className)}
      aria-roledescription="carousel"
      aria-label={labels.regionLabel}
      aria-live={isRotating && !holding ? "off" : "polite"}
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") setHovered(true);
      }}
      onPointerLeave={() => setHovered(false)}
      onPointerCancel={() => setHovered(false)}
      onFocusCapture={(e) => {
        if (!(e.target instanceof Element) || !e.target.closest("[data-carousel-rotation]")) {
          setUserPaused(true);
        }
      }}
    >
      {liveEdit ? (
        <div className="cinematic-admin-bar" role="toolbar" aria-label={liveEdit.carouselToolbar}>
          <div className="cinematic-admin-badge">
            <span className="cinematic-admin-dot" />
            <span className="cinematic-admin-title">{liveEdit.carouselAdmin}</span>
          </div>
          <div className="cinematic-admin-actions">
            <button
              type="button"
              onClick={() => setReorderMode((v) => !v)}
              className={cn("cinematic-admin-btn", reorderMode && "cinematic-admin-btn--active")}
              aria-pressed={reorderMode}
            >
              {reorderMode ? <CloseIcon className="size-3.5" /> : <ChevronIcon direction="end" className="size-3.5" />}
              <span>{reorderMode ? liveEdit.reorderDone : liveEdit.reorder}</span>
            </button>
            {activeProduct ? (
              <Link to={`/${locale}/dashboard/catalog/${activeProduct.id}`} className="cinematic-admin-btn">
                <PencilIcon className="size-3.5" />
                <span>{liveEdit.editProduct}</span>
              </Link>
            ) : null}
            <Link to={`/${locale}/dashboard/website#carousel`} className="cinematic-admin-btn">
              <GearIcon className="size-3.5" />
              <span>{liveEdit.carouselSettings}</span>
            </Link>
            <Link to={`/${locale}/dashboard/catalog`} className="cinematic-admin-btn">
              <PlusIcon className="size-3.5" />
              <span>{liveEdit.manageCatalog}</span>
            </Link>
          </div>
        </div>
      ) : null}

      <div ref={emblaRef} className="cinematic-viewport">
        <div className="cinematic-track">
          {products.map((product, index) => {
            const active = index === selectedIndex;
            const productUrl = `/${locale}/${product.categorySlug}/${product.slug}`;
            const formattedPrice =
              typeof product.priceFrom === "number" && product.priceFrom > 0
                ? formatPrice(product.priceFrom, "USD", locale)
                : null;
            const badge = product.carouselBadge || (product.isFeatured ? labels.featured : null);

            // A swipe's trailing click must not open the product.
            const handleCardClick = (e: React.MouseEvent) => {
              if (isDraggingRef.current || reorderMode) {
                e.preventDefault();
                return;
              }
              if ((e.target as HTMLElement).closest("a, button, .cinematic-edit-badge")) return;
              void navigate(productUrl);
            };

            return (
              <div
                key={product.id}
                className="cinematic-slide"
                role="group"
                aria-roledescription="slide"
                aria-hidden={!active}
                inert={!active}
                aria-label={labels.slideLabel.replace("{index}", String(index + 1)).replace("{total}", String(total))}
              >
                <div className="cinematic-card" onClick={handleCardClick}>
                  <div className="cinematic-card-media" aria-hidden="true">
                    {product.imageUrl ? (
                      <StoreImage
                        src={product.imageUrl}
                        alt=""
                        fit="cover"
                        focus={product.carouselFocus ?? { x: 50, y: 50 }}
                        width={1280}
                        priority={index === 0}
                        className="cinematic-card-img"
                      />
                    ) : null}
                    {badge || product.categoryName ? (
                      <div className="cinematic-media-tags">
                        {badge ? (
                          <span className="cinematic-tag">
                            <SparkIcon className="size-3" />
                            {badge}
                          </span>
                        ) : null}
                        {product.categoryName ? <span className="cinematic-tag">{product.categoryName}</span> : null}
                      </div>
                    ) : null}
                  </div>

                  {liveEdit && active ? (
                    <div className="cinematic-edit-badge">
                      <ProductEditor
                        gameId={product.id}
                        gameSlug={product.slug}
                        label={product.name}
                        locale={locale}
                        messages={liveEdit}
                      />
                    </div>
                  ) : null}

                  {reorderMode && active && liveEdit ? (
                    <div className="cinematic-reorder-actions">
                      <button
                        type="button"
                        disabled={index === 0 || isMoving}
                        onClick={() => moveProduct(index, index - 1)}
                        className="cinematic-reorder-move-btn"
                      >
                        <ChevronIcon direction={prevSide} className="size-4" />
                        <span>{liveEdit.moveEarlier}</span>
                      </button>
                      <span className="cinematic-reorder-pos-badge">
                        {index + 1} / {total}
                      </span>
                      <button
                        type="button"
                        disabled={index === total - 1 || isMoving}
                        onClick={() => moveProduct(index, index + 1)}
                        className="cinematic-reorder-move-btn"
                      >
                        <span>{liveEdit.moveLater}</span>
                        <ChevronIcon direction={nextSide} className="size-4" />
                      </button>
                    </div>
                  ) : null}

                  <div className="cinematic-card-body">
                    <div
                      className="cinematic-logo-tile"
                      style={product.logoSurfaceColor ? { backgroundColor: product.logoSurfaceColor } : undefined}
                      data-logo-tone={product.carouselLogoTone ?? undefined}
                    >
                      <CarouselBrand product={product} priority={index === 0} />
                    </div>
                    <h3 className="cinematic-title">{product.name}</h3>
                    {formattedPrice ? (
                      <p className="cinematic-price">
                        <span className="cinematic-price-label">{labels.fromPrice}</span>
                        <bdi className="cinematic-price-val" dir="ltr">
                          {formattedPrice}
                        </bdi>
                      </p>
                    ) : product.description ? (
                      <p className="cinematic-desc">{product.description}</p>
                    ) : null}
                    <Link
                      to={productUrl}
                      className="cinematic-cta"
                      aria-label={labels.goToProduct.replace("{name}", product.name)}
                    >
                      {labels.details}
                      <ArrowIcon direction={nextSide} className="size-4" />
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {total > 1 ? (
        <div className="cinematic-controls" role="group" aria-label={labels.regionLabel}>
          <button
            type="button"
            onClick={() => emblaApi?.scrollPrev()}
            className="cinematic-btn"
            aria-label={labels.previous}
          >
            <ArrowIcon direction={prevSide} className="size-4" />
          </button>

          <div className="cinematic-dots">
            {products.map((p, idx) => {
              const isActive = idx === selectedIndex;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => emblaApi?.scrollTo(idx)}
                  className={cn("cinematic-dot", isActive && "is-active")}
                  aria-current={isActive ? "true" : undefined}
                  aria-label={`${p.name} (${idx + 1}/${total})`}
                >
                  {isActive && isRotating ? (
                    <span
                      // Re-keyed per slide so the fill restarts from empty.
                      key={`${selectedIndex}`}
                      className="cinematic-dot-fill"
                      data-paused={holding ? "true" : undefined}
                      style={{ "--interval": `${intervalMs}ms` } as React.CSSProperties}
                      onAnimationEnd={advance}
                    />
                  ) : null}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => emblaApi?.scrollNext()}
            className="cinematic-btn"
            aria-label={labels.next}
          >
            <ArrowIcon direction={nextSide} className="size-4" />
          </button>

          {isRotating ? (
            <button
              type="button"
              data-carousel-rotation
              onClick={() => setUserPaused(!paused)}
              className="cinematic-btn"
              aria-label={paused ? labels.play : labels.pause}
              aria-pressed={paused}
            >
              {paused ? <PlayIcon className="size-3.5" /> : <PauseIcon className="size-3.5" />}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
