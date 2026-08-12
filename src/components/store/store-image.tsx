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
 */
export type StoreImageProps = {
  src: string | null;
  alt: string;
  className?: string;
  /** `object-position`, so a hero keeps the subject in frame. */
  focus?: { x: number; y: number };
  priority?: boolean;
  sizes?: string;
};

export function StoreImage({ src, alt, className, focus, priority = false, sizes }: StoreImageProps) {
  if (!src) {
    return (
      <div
        className={cn(
          "size-full bg-[linear-gradient(145deg,color-mix(in_srgb,var(--accent)_16%,var(--surface-strong)),var(--surface-inset))]",
          className,
        )}
        aria-hidden="true"
      />
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      decoding={priority ? "sync" : "async"}
      fetchPriority={priority ? "high" : "auto"}
      sizes={sizes}
      className={cn("size-full object-cover", className)}
      style={focus ? { objectPosition: `${focus.x}% ${focus.y}%` } : undefined}
    />
  );
}
