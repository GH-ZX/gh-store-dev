/**
 * Client-safe image source resolution, mirroring the legacy StoreImage rule:
 * local paths and Supabase Storage (which has its own edge resizing/CDN) go
 * direct; third-party supplier origins ride our edge-cached media proxy so a
 * slow supplier host never sits on the page's critical path.
 */
export function resolveImageSource(src: string | null | undefined): string | null {
  if (!src) return null;
  if (src.startsWith("/") || src.startsWith("data:") || src.startsWith("blob:")) {
    return src;
  }
  try {
    const url = new URL(src);
    if (url.pathname.includes("/storage/v1/object/public/")) {
      return src;
    }
    return `/api/media-proxy?url=${encodeURIComponent(src)}`;
  } catch {
    return src;
  }
}
