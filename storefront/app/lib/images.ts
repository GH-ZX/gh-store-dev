/**
 * Client-safe image source resolution, mirroring the legacy StoreImage rule:
 * local paths and Supabase Storage (which has its own edge resizing/CDN) go
 * direct; third-party supplier origins ride our edge-cached media proxy so a
 * slow supplier host never sits on the page's critical path.
 *
 * Pass `width` for below-the-fold cards and hero art: the proxy resizes once
 * at the edge and caches the webp variant, instead of shipping the supplier's
 * full upload to every phone.
 */
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
    const target = `/api/media-proxy?url=${encodeURIComponent(src)}`;
    return width && width > 0 ? `${target}&width=${Math.min(1920, Math.floor(width))}` : target;
  } catch {
    return src;
  }
}
