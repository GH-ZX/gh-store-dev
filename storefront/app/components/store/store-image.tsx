import { useState } from "react";
import { resolveImageSource } from "@/lib/images";
import { cn } from "@/lib/cn";
import { ArtworkPlaceholder } from "./artwork-placeholder";

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
const RESPONSIVE_WIDTHS = [320, 640, 1024, 1536];

/**
 * Supabase Storage can resize public images at the edge. Supplier hosts are not
 * assumed to support this endpoint, so unknown URLs keep the original source.
 */
function supabaseResponsiveSources(src: string): string | undefined {
  try {
    const url = new URL(src);
    const marker = "/storage/v1/object/public/";

    if (!url.pathname.includes(marker)) {
      return undefined;
    }

    const renderPath = url.pathname.replace(marker, "/storage/v1/render/image/public/");

    return RESPONSIVE_WIDTHS.map((width) => {
      const transformed = new URL(url);
      transformed.pathname = renderPath;
      transformed.searchParams.set("width", String(width));
      transformed.searchParams.set("quality", "75");
      transformed.searchParams.set("format", "webp");
      return `${transformed.toString()} ${width}w`;
    }).join(", ");
  } catch {
    return undefined;
  }
}


export type StoreImageProps = {
  src: string | null;
  alt: string;
  category?: string;
  className?: string;
  /** `object-position`, so a hero keeps the subject in frame. */
  focus?: { x: number; y: number };
  priority?: boolean;
  sizes?: string;
  fit?: "cover" | "contain";
};

export function StoreImage({
  src,
  alt,
  category,
  className,
  focus,
  priority = false,
  sizes,
  fit = "cover",
}: StoreImageProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <ArtworkPlaceholder
        title={alt}
        category={category}
        className={className}
      />
    );
  }
  const srcSet = supabaseResponsiveSources(src);
  const resolvedSrc = resolveImageSource(src) ?? undefined;

  return (
    <img
      src={resolvedSrc}
      srcSet={srcSet}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      decoding={priority ? "sync" : "async"}
      fetchPriority={priority ? "high" : "auto"}
      sizes={sizes}
      onError={() => setFailed(true)}
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
