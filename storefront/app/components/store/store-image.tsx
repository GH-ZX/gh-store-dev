import { useState } from "react";
import { ArtworkPlaceholder } from "@/components/store/artwork-placeholder";
import { getImageAttempts, type ArtworkFit, type LogoTone } from "@/lib/catalog/presentation";
import { cn } from "@/lib/cn";

export type StoreImageProps = {
  src: string | null;
  alt: string;
  className?: string;
  focus?: { x: number; y: number };
  priority?: boolean;
  sizes?: string;
  fit?: ArtworkFit;
  /** Intrinsic dimensions also bound responsive delivery for small card art. */
  width?: number;
  height?: number;
  /** Alternate real artwork, such as the product logo, after the primary fails. */
  fallbackSrc?: string | null;
  fallbackFit?: ArtworkFit;
  /** Product name used to identify a placeholder when no artwork can load. */
  fallbackLabel?: string;
  fallbackText?: string;
  /** Real catalog category used only to select the placeholder's palette. */
  category?: string;
  /** Opt-in monochrome treatment for an explicit logo, never ordinary artwork. */
  logoTone?: LogoTone;
  fallbackLogoTone?: LogoTone;
};

/** The source key resets failed attempts when navigation replaces the artwork. */
export function StoreImage(props: StoreImageProps) {
  const pixelMatch = props.sizes?.match(/(\d+)px$/);
  const computedWidth =
    props.width ?? (pixelMatch ? Number(pixelMatch[1]) * 2 : undefined);

  return (
    <ImageWithFallback
      key={`${props.src}:${props.fallbackSrc}:${props.width}:${props.sizes}`}
      {...props}
      width={computedWidth ?? props.width}
    />
  );
}

function ImageWithFallback({
  src,
  alt,
  className,
  focus,
  priority = false,
  sizes,
  fit = "cover",
  width,
  height,
  fallbackSrc,
  fallbackFit = "contain",
  fallbackLabel,
  fallbackText,
  category,
  logoTone,
  fallbackLogoTone,
}: StoreImageProps) {
  const [attemptIndex, setAttemptIndex] = useState(0);
  const attempts = getImageAttempts({ src, fallbackSrc, width, fit, fallbackFit, logoTone, fallbackLogoTone });
  const attempt = attempts[attemptIndex];

  if (!attempt) {
    return <div
      className={cn("sf-store-image-fallback relative size-full overflow-hidden", className)}
      role={alt ? "img" : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
      data-image-fallback="true"
    >
      <ArtworkPlaceholder title={fallbackLabel || alt || undefined} category={category} />
      {fallbackText ? <span className="sr-only">{fallbackText}</span> : null}
    </div>;
  }

  return <img
    key={`${attempt.src}:${attempt.srcSet ?? ""}`}
    src={attempt.src}
    srcSet={attempt.srcSet}
    alt={alt}
    width={width}
    height={height}
    loading={priority ? "eager" : "lazy"}
    decoding="async"
    fetchPriority={priority ? "high" : "auto"}
    sizes={sizes}
    data-artwork-fit={attempt.fit}
    data-logo-tone={attempt.logoTone || undefined}
    className={cn("sf-store-image size-full bg-[var(--surface-inset)]", attempt.fit === "contain" ? "object-contain" : "object-cover", className)}
    style={focus && attempt.fit === "cover" ? { objectPosition: `${focus.x}% ${focus.y}%` } : undefined}
    onError={() => setAttemptIndex((current) => current + 1)}
  />;
}
