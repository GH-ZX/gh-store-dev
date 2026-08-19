/* eslint-disable @next/next/no-img-element -- see the note below on provider image hosts */
import { cn } from "@/lib/cn";

/**
 * Catalog artwork.
 *
 * Deliberately a plain `img`, not `next/image`. Product media URLs come from
 * synced supplier catalogues and admin uploads, so the set of hosts is not known
 * ahead of time; `next/image` throws on a host missing from `remotePatterns`,
 * which would turn one unexpected supplier CDN into a broken product page.
 *
 * When artwork is missing, a tinted gradient stands in so cards keep their shape
 * instead of collapsing.
 *
 * The same gradient sits *behind* every image that does have a source. Supplier
 * art is served from hosts this store does not control — one of them measured
 * about eleven seconds for a 178 KB thumbnail — and until the bytes arrive an
 * image box paints nothing at all, so a grid of them reads as a page that failed
 * rather than one that is still arriving. It costs no request and no JavaScript:
 * `object-cover` fills the box, so the moment the artwork paints it covers the
 * gradient completely.
 */

const PLACEHOLDER =
  "bg-[linear-gradient(145deg,color-mix(in_srgb,var(--accent)_16%,var(--surface-strong)),var(--surface-inset))]";
export type StoreImageProps = {
  src: string | null;
  alt: string;
  className?: string;
  /** `object-position`, so a hero keeps the subject in frame. */
  focus?: { x: number; y: number };
  priority?: boolean;
  sizes?: string;
  /**
   * How the artwork fills its box. `cover` crops to the frame; `contain`
   * shows the whole upload, so a square supplier image stays a square with
   * whatever backdrop the caller paints behind it.
   */
  fit?: "cover" | "contain";
};

export function StoreImage({
  src,
  alt,
  className,
  focus,
  priority = false,
  sizes,
  fit = "cover",
}: StoreImageProps) {
  if (!src) {
    return <div className={cn("size-full", PLACEHOLDER, className)} aria-hidden="true" />;
  }

  return (
    <img
      src={src}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      decoding={priority ? "sync" : "async"}
      fetchPriority={priority ? "high" : "auto"}
      sizes={sizes}
      className={cn(
        "size-full",
        fit === "contain" ? "object-contain" : "object-cover",
        PLACEHOLDER,
        className,
      )}
      style={focus ? { objectPosition: `${focus.x}% ${focus.y}%` } : undefined}
    />
  );
}
