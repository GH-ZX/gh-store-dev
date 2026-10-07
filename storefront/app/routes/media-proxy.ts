/**
 * Edge image proxy.
 *
 * Fetches artwork from external provider hosts and streams it back with
 * long-lived public caching headers.
 *
 * Two things this must never do on a Worker: buffer the whole image, and do
 * the upstream fetch uncached. The previous version did both — every artwork
 * on a page was one sub-invocation holding a full `arrayBuffer()`, and forty
 * of those per homepage was enough to trip the 128 MB isolate limit (error
 * 1102) with a single visitor. The body is now piped through untouched, the
 * upstream fetch asks Cloudflare's cache to keep the bytes (`cf.cacheEverything`,
 * which works on any URL regardless of extension), and anything over
 * `MAX_BYTES` or not an image is refused before a byte is read.
 *
 * Resizing path (2026-10): the same proxy serves every `srcset` candidate.
 *
 *   /api/media-proxy?url=<origin>&width=320&quality=76
 *
 * `width` is the *render slot* the storefront asked for, and the variant is
 * produced by the Cloudflare image-resizing binding on the subrequest
 * (`cf.image` — the same engine behind `cdn-cgi/image`). Each width/quality is
 * a distinct cache key, so the edge resizes once and every later visitor gets
 * that variant. When the binding is unavailable, refuses the input, or returns
 * bytes that do not match the media type it claims, the raw upstream bytes are
 * served instead — a bigger image, never a broken one.
 */

import { isProxyableMediaUrl } from "@/lib/media/host-policy";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
const MAX_BYTES = 8 * 1024 * 1024;
const ONE_MONTH = 60 * 60 * 24 * 30;
const IMMUTABLE_CACHE = "public, max-age=31536000, s-maxage=31536000, immutable";
const DEFAULT_QUALITY = 76;
const MIN_QUALITY = 30;
const MAX_QUALITY = 90;
const MAX_WIDTH = 1920;
const MIN_WIDTH = 16;

/**
 * Output formats the resizer is asked for, and the media type each must
 * produce. AVIF is opted into per request rather than negotiated here: an
 * AVIF/WebP choice made from the `Accept` header would make the same URL mean
 * two different bodies, which is exactly what an immutable cache must not do.
 */
const REQUEST_FORMATS = {
  webp: "image/webp",
  avif: "image/avif",
} as const;
type RequestedFormat = keyof typeof REQUEST_FORMATS;

type CfRequestInit = RequestInit & {
  cf?: {
    cacheEverything?: boolean;
    cacheTtl?: number;
    image?: Record<string, string | number>;
  };
};

const MAX_REDIRECTS = 3;

/**
 * Refuse anything that is not a public host.
 *
 * Defence in depth: the worker runs with the `global_fetch_strictly_public`
 * compatibility flag, so the runtime itself refuses private and internal
 * addresses. This check exists so the proxy fails loudly and cheaply on its own
 * too. A Worker has no DNS API, so names are judged by shape and literal
 * addresses by range.
 */
function isPublicHost(rawHost: string): boolean {
  const host = rawHost.replace(/^\[|\]$/g, "").toLowerCase();

  if (
    !host ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return false;
  }

  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const [a, b] = host.split(".").map(Number);

    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }

  if (host.includes(":")) {
    // Loopback, unspecified, unique-local, link-local, and v4-mapped forms.
    return !(
      host === "::1" ||
      host === "::" ||
      /^(f[cd]|fe[89ab])/.test(host) ||
      host.startsWith("::ffff:")
    );
  }

  return host.includes(".");
}

/** Follow redirects by hand so every hop is checked, not only the first. */
async function fetchPublic(url: URL, init: CfRequestInit): Promise<Response> {
  let current = url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await fetch(current.toString(), {
      ...init,
      redirect: "manual",
    });

    if (response.status < 300 || response.status >= 400) {
      return response;
    }

    const location = response.headers.get("location");
    await response.body?.cancel();

    if (!location) {
      return new Response(null, { status: 502 });
    }

    current = new URL(location, current);

    if (
      !ALLOWED_PROTOCOLS.has(current.protocol) ||
      !isPublicHost(current.hostname)
    ) {
      return new Response(null, { status: 403 });
    }
  }

  return new Response(null, { status: 508 });
}

/** Clamp a client-supplied integer query parameter, or 0 when unusable. */
function boundedInt(raw: string | null, min: number, max: number, fallback = 0): number {
  if (raw === null || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min) return fallback;
  return Math.min(max, Math.floor(value));
}

/**
 * Formats whose bytes the transformer may rewrite.
 *
 * SVG is excluded on purpose: it is a document, the resizer passes it through
 * unmodified, and some suppliers' SVGs are not CSS-sanitised. Returning the
 * consumer's `format=webp` header over SVG bytes would be a lie the browser
 * cannot recover from.
 */
function isTransformableUpstream(contentType: string, target: URL): boolean {
  const type = contentType.toLowerCase();
  if (type.startsWith("image/svg") || type.includes("gif")) return false;
  if (!type.startsWith("image/")) return false;
  return !/\.(?:svg|svgz|gif)$/i.test(target.pathname);
}

/** Magic-byte sniff, so a resizer that silently passed bytes through is caught. */
type SniffedKind = "image/avif" | "image/webp" | "image/png" | "image/jpeg" | "image/gif" | null;

function sniffImageKind(view: Uint8Array): SniffedKind {
  if (view.length >= 12) {
    const ftyp = String.fromCharCode(view[4], view[5], view[6], view[7]);
    const brand = String.fromCharCode(view[8], view[9], view[10], view[11]);
    if (ftyp === "ftyp" && (brand === "avif" || brand === "avis")) return "image/avif";
  }
  if (
    view.length >= 12 &&
    String.fromCharCode(view[0], view[1], view[2], view[3]) === "RIFF" &&
    String.fromCharCode(view[8], view[9], view[10], view[11]) === "WEBP"
  ) {
    return "image/webp";
  }
  if (view.length >= 8 && view[0] === 0x89 && view[1] === 0x50 && view[2] === 0x4e && view[3] === 0x47) {
    return "image/png";
  }
  if (view.length >= 3 && view[0] === 0xff && view[1] === 0xd8 && view[2] === 0xff) {
    return "image/jpeg";
  }
  if (view.length >= 6 && String.fromCharCode(view[0], view[1], view[2]) === "GIF") {
    return "image/gif";
  }
  return null;
}

/**
 * True when the leading bytes are a vector document rather than a raster image.
 *
 * The media type a host declares is not evidence — a mislabelled `.svg`, or an
 * HTML error page served as `image/svg+xml`, would otherwise be cached under an
 * image type that browsers then fail to render. Both are refused here, before
 * the body is streamed to a client.
 */
function looksLikeSvgDocument(head: Uint8Array): boolean {
  if (head.length === 0) return false;
  if (head[0] === 0x3c) {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(head.subarray(0, 32)).trimStart().toLowerCase();
    return text.startsWith("<svg") ||
      text.startsWith("<?xml") ||
      text.startsWith("<!doctype") ||
      text.startsWith("<html") ||
      text.startsWith("<!--");
  }
  // A UTF-8 BOM before the document.
  if (head.length >= 4 && head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf) {
    return looksLikeSvgDocument(head.subarray(3));
  }
  return false;
}

/**
 * Stable ETag for a variant.
 *
 * The body is streamed, so it cannot be hashed: identifying the variant by its
 * full input set (origin, width, quality, negotiated format, upstream media
 * type) is exact for this proxy, because those are the only inputs that can
 * change the bytes. A 304 therefore always means "same variant still valid".
 */
function variantEtag(fingerprint: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let index = 0; index < fingerprint.length; index += 1) {
    const code = fingerprint.charCodeAt(index);
    a = Math.imul(a ^ code, 0x01000193);
    b = Math.imul(b + code, 0x85ebca6b) ^ (a >>> 13);
  }
  return `"${(a >>> 0).toString(36)}${(b >>> 0).toString(36)}"`;
}

/**
 * Whether the upstream permits a long-lived cache.
 *
 * An explicit `no-store`/`private` is honoured, and a shorter `max-age` is
 * treated as a statement about the asset's stability: a supplier that only
 * vouches for ten minutes should not have that image pinned to every phone for
 * a year. The absence of any header is normal for these hosts and takes the
 * proxy's own long window.
 */
function upstreamPermitsLongCache(cacheControl: string | null): boolean {
  if (!cacheControl) return true;
  const lowered = cacheControl.toLowerCase();
  if (lowered.includes("no-store") || lowered.includes("private") || lowered.includes("no-cache")) {
    return false;
  }
  const maxAge = /(?:^|,)\s*(?:s-maxage|max-age)\s*=\s*(\d+)/.exec(lowered);
  if (maxAge) return Number(maxAge[1]) >= ONE_MONTH;
  return true;
}

/**
 * Read the first chunk of a streamed body so the media type can be checked
 * against the actual bytes without buffering the whole image.
 */
async function openBody(
  body: ReadableStream<Uint8Array>,
): Promise<{ stream: ReadableStream<Uint8Array>; head: Uint8Array } | null> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  try {
    while (size < 16) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;
      chunks.push(value);
      size += value.byteLength;
    }
  } catch {
    return null;
  }

  const head = new Uint8Array(Math.min(size, 16));
  let offset = 0;
  for (const chunk of chunks) {
    if (offset >= head.length) break;
    const slice = chunk.subarray(0, head.length - offset);
    head.set(slice, offset);
    offset += slice.byteLength;
  }

  return {
    head,
    stream: new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
      },
      async pull(controller) {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        if (value) controller.enqueue(value);
      },
      cancel(reason) {
        return reader.cancel(reason);
      },
    }),
  };
}

type VariantPlan = {
  width: number;
  quality: number;
  format: RequestedFormat;
  contentType: string;
};

/**
 * The `format` query parameter, restricted to what this proxy will cache.
 *
 * `auto` (and anything unrecognised) becomes WebP: it is the one format every
 * browser this store targets renders, so a variant URL has one meaning.
 */
function requestedFormat(searchParams: URLSearchParams): RequestedFormat {
  const raw = (searchParams.get("format") || "").trim().toLowerCase();
  return raw === "avif" ? "avif" : "webp";
}

export async function loader({
  request,
}: {
  request: Request;
}): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const rawUrl = searchParams.get("url");

  if (!rawUrl) {
    return new Response("Missing url parameter", { status: 400 });
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(rawUrl);
  } catch {
    return new Response("Invalid URL", { status: 400 });
  }

  if (!ALLOWED_PROTOCOLS.has(targetUrl.protocol)) {
    return new Response("Forbidden protocol", { status: 403 });
  }

  if (!isPublicHost(targetUrl.hostname) || !isProxyableMediaUrl(targetUrl)) {
    return new Response("Forbidden host", { status: 403 });
  }

  // `width` is a render-slot request; `quality` tunes the variant; `format`
  // mirrors `cdn-cgi/image` naming so a URL written for that API still means
  // the same thing here.
  const width = boundedInt(searchParams.get("width"), MIN_WIDTH, MAX_WIDTH);
  const quality = boundedInt(searchParams.get("quality"), MIN_QUALITY, MAX_QUALITY, DEFAULT_QUALITY);
  const format = requestedFormat(searchParams);

  try {
    const baseInit: CfRequestInit = {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "image/avif,image/webp,image/apng,image/svg+xml,image/*,*;q=0.8",
      },
      cf: {
        cacheEverything: true,
        cacheTtl: ONE_MONTH,
      },
    };

    // First attempt: ask the image-resizing engine for the slot-sized variant.
    // A 404 from the resizer (feature not enabled on the zone, or a plan
    // without it) must not lose the image, so the raw fetch below is the
    // fallback rather than an error path.
    let upstreamRes: Response | null = null;
    let plan: VariantPlan | null = null;

    if (width > 0) {
      try {
        const resized = await fetchPublic(targetUrl, {
          ...baseInit,
          cf: {
            ...baseInit.cf,
            image: { width, quality, format, fit: "scale-down" },
          },
        });

        if (resized.ok && resized.body) {
          const contentType = resized.headers.get("content-type") || "";
          if (isTransformableUpstream(contentType, targetUrl) && contentType.toLowerCase().startsWith("image/")) {
            upstreamRes = resized;
            plan = { width, quality, format, contentType };
          } else {
            await resized.body.cancel();
          }
        } else {
          await resized.body?.cancel();
        }
      } catch {
        // Fall through to the raw fetch: a resize failure is not a page failure.
      }
    }

    // Raw bytes. Used when no width was asked for, when resizing is
    // unavailable, and when the resizer's answer failed its own media check.
    if (!upstreamRes) {
      upstreamRes = await fetchPublic(targetUrl, baseInit);
      plan = null;
    }

    if (!upstreamRes.ok || !upstreamRes.body) {
      return new Response(`Upstream failed with status ${upstreamRes.status}`, {
        status: upstreamRes.status === 200 ? 502 : upstreamRes.status,
        headers: { "Cache-Control": "no-store" },
      });
    }

    const upstreamType = (upstreamRes.headers.get("content-type") || "application/octet-stream")
      .split(";")[0]
      .trim()
      .toLowerCase();
    const declaredLength = Number(upstreamRes.headers.get("content-length") ?? "0");

    if (!upstreamType.startsWith("image/") || declaredLength > MAX_BYTES) {
      await upstreamRes.body.cancel();
      return new Response("Invalid upstream image", { status: 502, headers: { "Cache-Control": "no-store" } });
    }

    const body = await openBody(upstreamRes.body);
    if (!body) {
      return new Response("Upstream body unreadable", { status: 502, headers: { "Cache-Control": "no-store" } });
    }

    // A variant must actually be the format it was asked for. If the resizer
    // passed the original through (or the origin lied about its type), the
    // real bytes win: the header is corrected from the magic bytes instead of
    // being trusted, so a browser never receives mislabelled content. A vector
    // document fails this check outright — serving markup as an image is how a
    // supplier-hosted SVG becomes a stored-XSS vector.
    const sniffed = sniffImageKind(body.head);
    const expected = plan ? plan.contentType.split(";")[0].trim().toLowerCase() : upstreamType;
    const mismatch = plan !== null && expected !== sniffed;
    const mediaType = sniffed ?? (mismatch ? expected : upstreamType);
    if (looksLikeSvgDocument(body.head) || sniffed === null) {
      await body.stream.cancel();
      return new Response("Unsupported upstream media", {
        status: 502,
        headers: { "Cache-Control": "no-store" },
      });
    }

    const resized = plan !== null && !mismatch;
    const cacheable = upstreamPermitsLongCache(upstreamRes.headers.get("cache-control"));

    const headers = new Headers({
      "Content-Type": mediaType,
      "Access-Control-Allow-Origin": "*",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      // The variant is fixed by this URL alone — width, quality and format are
      // all in the query string — so no request header can change the body and
      // no `Vary` is needed for a shared cache to stay correct.
      "X-Media-Variant": resized ? `${plan?.width}w-q${plan?.quality}-${plan?.format}` : "original",
      "X-Media-Resized": resized ? "cf-image" : "passthrough",
    });

    if (cacheable) {
      headers.set("Cache-Control", IMMUTABLE_CACHE);
      headers.set(
        "ETag",
        variantEtag(
          `${targetUrl.toString()}|${width}|${quality}|${plan?.format ?? "original"}|${upstreamType}|${mediaType}`,
        ),
      );
    } else {
      // An upstream that forbids caching must not be outlived by our edge copy.
      headers.set("Cache-Control", "no-store");
    }

    // Upstream length describes the original; a resized body is smaller.
    if (declaredLength > 0 && !resized) {
      headers.set("Content-Length", String(declaredLength));
    }

    const etag = headers.get("ETag");
    if (etag && request.headers.get("if-none-match") === etag) {
      await body.stream.cancel();
      return new Response(null, { status: 304, headers });
    }

    return new Response(body.stream, { status: 200, headers });
  } catch {
    return new Response("Failed to fetch upstream media", {
      status: 502,
      headers: { "Cache-Control": "no-store" },
    });
  }
}

export { isPublicHost, sniffImageKind, variantEtag };
