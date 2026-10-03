"use client";

import { Link, useNavigate, useRevalidator } from "react-router";
import useEmblaCarousel from "embla-carousel-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ProductEditor } from "@/components/live-edit/product-editor";
import { StoreImage } from "@/components/store/store-image";
import { CarouselBrand } from "@/components/home/carousel-brand";
import {
  ArrowIcon,
  BoltIcon,
  ChevronIcon,
  CloseIcon,
  GearIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  SparkIcon,
  StarIcon,
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
  labels?: {
    regionLabel?: string;
    slideLabel?: string;
    goToProduct?: string;
    previous?: string;
    next?: string;
    pause?: string;
    play?: string;
    details?: string;
    featured?: string;
    fromPrice?: string;
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
    async (fromIndex: number, direction: "left" | "right") => {
      const toIndex = direction === "left" ? fromIndex - 1 : fromIndex + 1;
      if (toIndex < 0 || toIndex >= total) return;

      const fromId = products[fromIndex].id;
      const toId = products[toIndex].id;

      setIsMoving(true);
      try {
        const result = await reorderCarouselProducts(fromId, toId);
        if (result.success) {
          void revalidate();
        }
      } catch (err) {
        console.error("Failed to reorder carousel products:", err);
      } finally {
        setIsMoving(false);
      }
    },
    [products, total, revalidate],
  );

  // Production-grade Embla Carousel Instance (Swiper-grade touch physics + Apple glide)
  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop,
    align: "center",
    direction: isRtl ? "rtl" : "ltr",
    containScroll: loop ? false : "trimSnaps",
    dragFree: false,
    skipSnaps: false,
    duration: 32, // Luxury momentum glide (Apple / Linear standard)
    dragThreshold: 8, // Instantaneous, responsive touch detection
    inViewThreshold: 0.65,
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
  const [progress, setProgress] = useState(0);
  const progressStartTimeRef = useRef<number>(Date.now());

  const isDraggingRef = useRef(false);

  // Listen to Embla pointer and scroll events to freeze autoplay and distinguish tap vs drag
  useEffect(() => {
    if (!emblaApi) return;
    const onPointerDown = () => {
      isDraggingRef.current = false;
      setIsInteracting(true);
    };
    const onScroll = () => {
      isDraggingRef.current = true;
    };
    const onPointerUp = () => {
      setTimeout(() => {
        setIsInteracting(false);
      }, 1500);
    };

    emblaApi.on("pointerDown", onPointerDown);
    emblaApi.on("scroll", onScroll);
    emblaApi.on("pointerUp", onPointerUp);

    return () => {
      emblaApi.off("pointerDown", onPointerDown);
      emblaApi.off("scroll", onScroll);
      emblaApi.off("pointerUp", onPointerUp);
    };
  }, [emblaApi]);

  // Smooth live progress timer for active slide indicator
  useEffect(() => {
    if (!emblaApi || !isRotating || paused || tabHidden || hovered || isInteracting) {
      return;
    }

    progressStartTimeRef.current = Date.now();
    setProgress(0);

    const frame = () => {
      const elapsed = Date.now() - progressStartTimeRef.current;
      const currentPct = Math.min(100, (elapsed / intervalMs) * 100);
      setProgress(currentPct);

      if (elapsed >= intervalMs) {
        if (emblaApi.canScrollNext()) {
          emblaApi.scrollNext();
        } else {
          emblaApi.scrollTo(0);
        }
        progressStartTimeRef.current = Date.now();
        setProgress(0);
      }
    };

    const intervalTimer = setInterval(frame, 50);
    return () => clearInterval(intervalTimer);
  }, [emblaApi, isRotating, paused, tabHidden, hovered, isInteracting, intervalMs, selectedIndex]);

  const toggleRotation = useCallback(() => {
    setUserPaused(!paused);
  }, [paused]);

  if (total === 0) return null;

  const resolvedLabels = {
    regionLabel: labels?.regionLabel ?? (isRtl ? "العروض والمنتجات المميزة" : "Featured Products & Offers"),
    slideLabel: labels?.slideLabel ?? (isRtl ? "شريحة {index} من {total}" : "Slide {index} of {total}"),
    goToProduct: labels?.goToProduct ?? (isRtl ? "عرض تفاصيل {name}" : "View details for {name}"),
    previous: labels?.previous ?? (isRtl ? "الشريحة السابقة" : "Previous slide"),
    next: labels?.next ?? (isRtl ? "الشريحة التالية" : "Next slide"),
    pause: labels?.pause ?? (isRtl ? "إيقاف التدوير التلقائي" : "Pause auto-rotation"),
    play: labels?.play ?? (isRtl ? "تشغيل التدوير التلقائي" : "Play auto-rotation"),
    details: labels?.details ?? (isRtl ? "استكشف الباقات" : "Explore Offers"),
    featured: labels?.featured ?? (isRtl ? "مميز" : "Featured"),
    fromPrice: labels?.fromPrice ?? (isRtl ? "تبدأ من" : "From"),
  };

  const activeProduct = products[selectedIndex] ?? products[0];

  return (
    <section
      className={cn("cinematic-hero", className)}
      aria-roledescription="carousel"
      aria-label={resolvedLabels.regionLabel}
      aria-live={isRotating && !paused && !hovered && !tabHidden ? "off" : "polite"}
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
      {/* Admin Settings & Controls Bar (Visible only when Admin is signed in) */}
      {liveEdit ? (
        <div
          className="cinematic-admin-bar"
          role="toolbar"
          aria-label={isRtl ? "شريط أدوات المسؤول" : "Admin Carousel Toolbar"}
        >
          <div className="cinematic-admin-badge">
            <span className="cinematic-admin-dot" />
            <span className="cinematic-admin-title">
              {isRtl ? "إدارة الكاروسيل" : "Carousel Admin"}
            </span>
          </div>

          <div className="cinematic-admin-actions">
            {/* Reorder Mode Toggle Button */}
            <button
              type="button"
              onClick={() => setReorderMode((v) => !v)}
              className={cn(
                "cinematic-admin-btn",
                reorderMode && "cinematic-admin-btn--active"
              )}
              aria-pressed={reorderMode}
              title={
                reorderMode
                  ? isRtl
                    ? "إنهاء ترتيب المنتجات"
                    : "Done Reordering"
                  : isRtl
                    ? "ترتيب المنتجات المميزة في الكاروسيل"
                    : "Reorder Featured Carousel Items"
              }
            >
              {reorderMode ? (
                <CloseIcon className="size-3.5" />
              ) : (
                <ChevronIcon direction="end" className="size-3.5" />
              )}
              <span>
                {reorderMode
                  ? isRtl
                    ? "إنهاء الترتيب"
                    : "Done"
                  : isRtl
                    ? "ترتيب الشرائح"
                    : "Reorder"}
              </span>
            </button>

            {/* Edit Current Product Shortcut */}
            {activeProduct ? (
              <Link
                to={`/${locale}/dashboard/catalog/${activeProduct.id}`}
                className="cinematic-admin-btn"
                title={
                  isRtl
                    ? `تعديل منتج (${activeProduct.name}) في لوحة التحكم`
                    : `Edit (${activeProduct.name}) in Dashboard`
                }
              >
                <PencilIcon className="size-3.5" />
                <span>{isRtl ? "تعديل هذا المنتج" : "Edit Product"}</span>
              </Link>
            ) : null}

            {/* Direct Link to Carousel Speed & Behavior Settings */}
            <Link
              to={`/${locale}/dashboard/website#carousel`}
              className="cinematic-admin-btn"
              title={
                isRtl
                  ? "تعديل سرعة الكاروسيل، التكرار، والتأثيرات"
                  : "Carousel Speed, Loop & Autoplay Settings"
              }
            >
              <GearIcon className="size-3.5" />
              <span>{isRtl ? "إعدادات الكاروسيل" : "Settings"}</span>
            </Link>

            {/* Direct Link to Catalog to Add/Remove from Carousel */}
            <Link
              to={`/${locale}/dashboard/catalog`}
              className="cinematic-admin-btn"
              title={
                isRtl
                  ? "إدارة المنتجات المميزة والكتالوج"
                  : "Manage Catalog & Featured Items"
              }
            >
              <PlusIcon className="size-3.5" />
              <span>{isRtl ? "إدارة الكتالوج" : "Catalog"}</span>
            </Link>
          </div>
        </div>
      ) : null}

      {/* Viewport with Center Peeking Stage */}
      <div className="cinematic-viewport-wrapper">
        <div ref={emblaRef} className="cinematic-viewport">
          <div className="cinematic-track">
            {products.map((product, index) => {
              const active = index === selectedIndex;
              const accentColor = product.carouselColor || "var(--accent)";
              const productUrl = `/${locale}/${product.categorySlug}/${product.slug}`;
              const formattedPrice =
                typeof product.priceFrom === "number" && product.priceFrom > 0
                  ? formatPrice(product.priceFrom, "USD", locale)
                  : null;

              // Card tap handler: ignore if dragged/swiped!
              const handleCardClick = (e: React.MouseEvent) => {
                if (!emblaApi) return;
                // If user was swiping or dragging, ignore click completely
                if (isDraggingRef.current) {
                  e.preventDefault();
                  return;
                }

                if (reorderMode) {
                  e.preventDefault();
                  return;
                }

                // If user tapped admin pencil, let that modal open
                if ((e.target as HTMLElement).closest(".cinematic-edit-badge")) {
                  return;
                }

                if (!active) {
                  e.preventDefault();
                  emblaApi.scrollTo(index);
                } else {
                  void navigate(productUrl);
                }
              };

              return (
                <div
                  key={product.id}
                  className={cn("cinematic-slide", active ? "is-active" : "is-peeking")}
                  role="group"
                  aria-roledescription="slide"
                  aria-hidden={!active}
                  aria-label={`${index + 1} / ${total}: ${product.name}`}
                  onClick={handleCardClick}
                  tabIndex={active ? 0 : -1}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      if (!active) {
                        emblaApi?.scrollTo(index);
                      } else {
                        void navigate(productUrl);
                      }
                    }
                  }}
                >
                  {/* The Inner Card Stage: Handles scale and ambient lighting without breaking Embla width math */}
                  <div
                    className="cinematic-card-stage"
                    style={
                      {
                        "--slide-accent": accentColor,
                      } as React.CSSProperties
                    }
                  >
                    {/* Ambient Glow Aura behind active card */}
                    <div className="cinematic-card-glow" aria-hidden="true" />

                    {/* Double-Bezel Outer Shell Container */}
                    <div className="cinematic-card-shell">
                      {/* TOP SECTION: 100% Pure, Un-darkened Artwork (Zero Dark Overlay) */}
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

                        {/* Top Floating Glass Badge */}
                        <div className="cinematic-media-tags">
                          {product.carouselBadge ? (
                            <span className="cinematic-glass-tag cinematic-glass-tag--accent">
                              <SparkIcon className="size-3" />
                              {product.carouselBadge}
                            </span>
                          ) : (
                            <span className="cinematic-glass-tag cinematic-glass-tag--accent">
                              <BoltIcon className="size-3" />
                              {isRtl ? "تسليم فوري" : "Instant"}
                            </span>
                          )}

                          {product.categoryName ? (
                            <span className="cinematic-glass-tag cinematic-glass-tag--subtle">
                              {product.categoryName}
                            </span>
                          ) : null}
                        </div>

                        {/* Admin Live Edit Pencil */}
                        {liveEdit && active ? (
                          <div
                            className="cinematic-edit-badge"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ProductEditor
                              gameId={product.id}
                              gameSlug={product.slug}
                              label={product.name}
                              locale={locale}
                              messages={liveEdit}
                            />
                          </div>
                        ) : null}

                        {/* Interactive Reordering Controls when in Reorder Mode */}
                        {reorderMode && active ? (
                          <div
                            className="cinematic-reorder-actions"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                          >
                            <button
                              type="button"
                              disabled={index === 0 || isMoving}
                              onClick={() => moveProduct(index, isRtl ? "right" : "left")}
                              className="cinematic-reorder-move-btn"
                              aria-label={isRtl ? "تحريك لليمين (للأمام)" : "Move earlier"}
                              title={isRtl ? "تحريك لليمين (للأمام)" : "Move earlier"}
                            >
                              <ChevronIcon direction="start" className="size-4" />
                              <span>{isRtl ? "تقديم" : "Earlier"}</span>
                            </button>

                            <div className="cinematic-reorder-pos-badge">
                              <span>
                                {index + 1} / {total}
                              </span>
                            </div>

                            <button
                              type="button"
                              disabled={index === total - 1 || isMoving}
                              onClick={() => moveProduct(index, isRtl ? "left" : "right")}
                              className="cinematic-reorder-move-btn"
                              aria-label={isRtl ? "تحريك لليسار (للخلف)" : "Move later"}
                              title={isRtl ? "تحريك لليسار (للخلف)" : "Move later"}
                            >
                              <span>{isRtl ? "تأخير" : "Later"}</span>
                              <ChevronIcon direction="end" className="size-4" />
                            </button>
                          </div>
                        ) : null}
                      </div>

                      {/* BOTTOM SECTION: Dedicated Action & Content Tray (Down Below the Image) */}
                      <div className="cinematic-card-tray">
                        {/* Dynamic Glossy Product-Artwork Blurred Backdrop */}
                        {product.imageUrl ? (
                          <div className="cinematic-tray-glass-bg" aria-hidden="true">
                            <StoreImage
                              src={product.imageUrl}
                              alt=""
                              fit="cover"
                              focus={product.carouselFocus ?? { x: 50, y: 85 }}
                              width={640}
                              priority={index === 0}
                              className="cinematic-tray-glass-img"
                            />
                            <div className="cinematic-tray-glass-sheen" />
                          </div>
                        ) : null}

                        <div className="cinematic-tray-info">
                          {/* Brand Logo - Native floating mark with zero background tile */}
                          <div
                            className="cinematic-tray-logo"
                            data-logo-tone={product.carouselLogoTone ?? undefined}
                          >
                            <CarouselBrand product={product} priority={index === 0} />
                          </div>

                          {/* Product Title + Meta (Price & Star Rating) */}
                          <div className="cinematic-tray-text">
                            <h3 className="cinematic-tray-title">{product.name}</h3>

                            <div className="cinematic-tray-meta">
                              {formattedPrice ? (
                                <div className="cinematic-price-box">
                                  <span className="cinematic-price-label">{resolvedLabels.fromPrice}</span>
                                  <span className="cinematic-price-val" dir="ltr">
                                    {formattedPrice}
                                  </span>
                                </div>
                              ) : product.description ? (
                                <p className="cinematic-desc-preview">{product.description}</p>
                              ) : null}

                              {/* Star Rating Trust Badge */}
                              <div
                                className="cinematic-star-badge"
                                title={isRtl ? "تقييم 4.9 من 5 نجوم" : "Rating 4.9 out of 5 stars"}
                              >
                                <StarIcon filled className="size-3 text-amber-400" />
                                <span className="cinematic-star-val">4.9</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Sleek Compact Action Disc (Takes minimal space, prevents title/price squeeze) */}
                        <div className="cinematic-tray-action">
                          <Link
                            to={productUrl}
                            tabIndex={active ? undefined : -1}
                            className="cinematic-compact-action group"
                            aria-label={`${product.name} - ${resolvedLabels.details}`}
                            onClick={(e) => {
                              if (isDraggingRef.current) {
                                e.preventDefault();
                                e.stopPropagation();
                                return;
                              }
                              e.stopPropagation();
                            }}
                          >
                            <ArrowIcon
                              direction="end"
                              className={cn(
                                "size-3.5 transition-transform duration-200",
                                isRtl ? "group-hover:-translate-x-0.5 rotate-180" : "group-hover:translate-x-0.5"
                              )}
                            />
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Floating Minimalist Control Dock */}
      {total > 1 ? (
        <div className="cinematic-dock-wrapper">
          <div className="cinematic-dock" role="group" aria-label={resolvedLabels.regionLabel}>
            {/* Prev Button */}
            <button
              type="button"
              onClick={() => emblaApi?.scrollPrev()}
              className="cinematic-dock-btn"
              aria-label={resolvedLabels.previous}
            >
              <ArrowIcon direction="start" className={cn("size-4", isRtl && "rotate-180")} />
            </button>

            {/* Slide Index Counter */}
            <div className="cinematic-counter" aria-hidden="true">
              <span className="cinematic-counter-cur">
                {String(selectedIndex + 1).padStart(2, "0")}
              </span>
              <span className="cinematic-counter-sep">/</span>
              <span className="cinematic-counter-tot">
                {String(total).padStart(2, "0")}
              </span>
            </div>

            {/* Interactive Progress Indicators */}
            <div className="cinematic-pills-list">
              {products.map((p, idx) => {
                const isActive = idx === selectedIndex;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => emblaApi?.scrollTo(idx)}
                    className={cn("cinematic-pill-dot", isActive && "is-active")}
                    aria-current={isActive ? "true" : undefined}
                    aria-label={`${p.name} (${idx + 1}/${total})`}
                  >
                    {isActive ? (
                      <span
                        className="cinematic-pill-fill"
                        style={{ width: `${progress}%` }}
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>

            {/* Next Button */}
            <button
              type="button"
              onClick={() => emblaApi?.scrollNext()}
              className="cinematic-dock-btn"
              aria-label={resolvedLabels.next}
            >
              <ArrowIcon direction="end" className={cn("size-4", isRtl && "rotate-180")} />
            </button>

            {/* Pause / Play Toggle */}
            {isRotating ? (
              <button
                type="button"
                data-carousel-rotation
                onClick={toggleRotation}
                className="cinematic-dock-btn cinematic-dock-btn--toggle"
                aria-label={paused ? resolvedLabels.play : resolvedLabels.pause}
                aria-pressed={paused}
              >
                {paused ? <PlayIcon className="size-3.5" /> : <PauseIcon className="size-3.5" />}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
