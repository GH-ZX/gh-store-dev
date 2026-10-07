import { isAllowedMediaHost } from "@/lib/media/host-policy";

/**
 * Client-safe image source resolution, mirroring the legacy StoreImage rule:
 * local paths and Supabase Storage (which has its own edge resizing/CDN) go
 * direct; third-party supplier origins ride our edge-cached media proxy so a
 * slow supplier host never sits on the page's critical path.
 *
 * Pass `width` for below-the-fold cards and hero art: the proxy asks the
 * Cloudflare image-resizing engine for that render-slot width and caches the
 * variant, instead of shipping the supplier's full upload to every phone.
 *
 * A host the proxy refuses is served straight from its own origin rather than
 * through a request that would 403 — the page still renders, and the catalog
 * migration that removes such hosts is what actually retires them.
 */
export const MEDIA_PROXY_PATH = "/api/media-proxy";

/** Bumped when the upstream host list or resize semantics change. */
export const MEDIA_PROXY_VERSION = 4;

/** Default variant quality. Matches the proxy's own clamp (30–90). */
export const MEDIA_VARIANT_QUALITY = 76;

/**
 * Variant format.
 *
 * WebP, not AVIF, on purpose: a variant URL must mean exactly one body for an
 * immutable cache to be correct, and AVIF support still depends on the client.
 * The proxy accepts `format=avif` for a future opt-in path (its `Accept`-less
 * callers can pass it), but nothing in the storefront sets it today.
 */
export const MEDIA_VARIANT_FORMAT = "webp";

export function mediaProxyUrl(src: string, width?: number, quality = MEDIA_VARIANT_QUALITY): string {
  const params = new URLSearchParams({ url: src, v: String(MEDIA_PROXY_VERSION) });
  if (width && width > 0) {
    params.set("width", String(Math.min(1920, Math.max(16, Math.floor(width)))));
    if (quality !== MEDIA_VARIANT_QUALITY) params.set("quality", String(quality));
  }
  return `${MEDIA_PROXY_PATH}?${params.toString()}`;
}

export function resolveImageSource(
  src: string | null | undefined,
  width?: number,
): string | null {
  if (!src) return null;
  if (src.startsWith("/") || src.startsWith("data:") || src.startsWith("blob:")) {
    return src;
  }
  try {
    const url = new URL(src);
    if (url.pathname.includes("/storage/v1/object/public/")) {
      return src;
    }
    if (!isAllowedMediaHost(url.hostname)) {
      return src;
    }
    return mediaProxyUrl(src, width);
  } catch {
    return src;
  }
}
