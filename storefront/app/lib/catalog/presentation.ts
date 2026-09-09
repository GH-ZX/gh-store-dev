import type { StoreProduct } from "@/lib/catalog/product-mapper";
import type { StoreOffer } from "@/lib/catalog/offer-mapper";
import { resolveImageSource } from "@/lib/images";

export type ArtworkFit = "cover" | "contain";
export type LogoTone = "light" | "dark" | null;

export type CatalogArtwork = {
  src: string | null;
  fit: ArtworkFit;
  fallbackSrc: string | null;
  fallbackFit: ArtworkFit;
  logoTone: LogoTone;
  fallbackLogoTone: LogoTone;
};

/** Preserve configured artwork. Only game scenery is cropped to fill a card. */
export function getProductArtwork(product: Pick<StoreProduct, "imageUrl" | "logoUrl" | "kind" | "carouselLogoTone">): CatalogArtwork {
  const src = product.imageUrl || product.logoUrl || null;
  const fallbackSrc = src === product.imageUrl && product.logoUrl !== src ? product.logoUrl : null;
  const isLogo = Boolean(src && src === product.logoUrl);
  return {
    src,
    fit: product.kind === "game" && !isLogo ? "cover" : "contain",
    fallbackSrc,
    fallbackFit: "contain",
    logoTone: isLogo ? product.carouselLogoTone : null,
    fallbackLogoTone: fallbackSrc ? product.carouselLogoTone : null,
  };
}

export function getOfferArtwork(offer: Pick<StoreOffer, "imageUrl" | "game" | "offerType">): CatalogArtwork {
  const src = offer.imageUrl || offer.game?.logoUrl || offer.game?.imageUrl || null;
  const fallbackSrc = [offer.game?.logoUrl, offer.game?.imageUrl].find((candidate) => candidate && candidate !== src) ?? null;
  const isLogo = Boolean(src && src === offer.game?.logoUrl);
  return {
    src,
    fit: offer.offerType === "topup" && !isLogo ? "cover" : "contain",
    fallbackSrc,
    fallbackFit: fallbackSrc === offer.game?.logoUrl || offer.offerType !== "topup" ? "contain" : "cover",
    logoTone: null,
    fallbackLogoTone: null,
  };
}

export type ImageAttempt = {
  src: string;
  srcSet?: string;
  fit: ArtworkFit;
  logoTone: LogoTone;
};

const RESPONSIVE_WIDTHS = [160, 240, 320, 384, 480, 640, 960, 1280, 1536];
const STORAGE_MARKER = "/storage/v1/object/public/";

function responsiveSources(src: string, width: number): string | undefined {
  let url: URL;
  try { url = new URL(src); } catch { return undefined; }
  if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
  if (/\.(?:svg|gif)$/i.test(url.pathname)) return undefined;

  const widths = [...new Set([...RESPONSIVE_WIDTHS.filter((candidate) => candidate < width), width])];
  return widths.map((candidate) => {
    if (url.pathname.includes(STORAGE_MARKER)) {
      const transformed = new URL(url);
      transformed.pathname = url.pathname.replace(STORAGE_MARKER, "/storage/v1/render/image/public/");
      transformed.searchParams.set("width", String(candidate));
      transformed.searchParams.set("quality", "75");
      // Storage negotiates WebP automatically. format=webp is not required.
      return `${transformed.toString()} ${candidate}w`;
    }
    return `${resolveImageSource(src, candidate)} ${candidate}w`;
  }).join(", ");
}

/** A finite sequence: optimized primary, original primary, then alternate. */
export function getImageAttempts({
  src,
  fallbackSrc,
  width,
  fit = "cover",
  fallbackFit = "contain",
  logoTone = null,
  fallbackLogoTone = null,
}: {
  src: string | null;
  fallbackSrc?: string | null;
  width?: number;
  fit?: ArtworkFit;
  fallbackFit?: ArtworkFit;
  logoTone?: LogoTone;
  fallbackLogoTone?: LogoTone;
}): ImageAttempt[] {
  const primary = src || fallbackSrc || null;
  if (!primary) return [];
  const maximumWidth = typeof width === "number" && Number.isFinite(width)
    ? Math.min(1920, Math.max(1, Math.round(width)))
    : 1536;
  const primaryFit = src ? fit : fallbackFit;
  const primaryTone = src ? logoTone : fallbackLogoTone;
  const original = resolveImageSource(primary)!;
  const srcSet = responsiveSources(primary, maximumWidth);
  const optimized = srcSet ? resolveImageSource(primary, maximumWidth)! : original;
  const attempts: ImageAttempt[] = [{ src: optimized, srcSet, fit: primaryFit, logoTone: primaryTone }];
  if (srcSet || optimized !== original) attempts.push({ src: original, fit: primaryFit, logoTone: primaryTone });
  if (fallbackSrc && fallbackSrc !== primary) {
    attempts.push({ src: resolveImageSource(fallbackSrc)!, fit: fallbackFit, logoTone: fallbackLogoTone });
  }
  return attempts;
}

export function artworkMonogram(name: string): string {
  return name.trim().split(/\s+/).map((word) => word.match(/[\p{L}\p{N}]/u)?.[0] ?? "").filter(Boolean).slice(0, 2).join("").toLocaleUpperCase();
}
