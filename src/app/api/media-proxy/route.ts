import { NextResponse } from "next/server";

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
 */

export const dynamic = "force-dynamic";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
const MAX_BYTES = 8 * 1024 * 1024;
const ONE_MONTH = 60 * 60 * 24 * 30;

type CfRequestInit = RequestInit & {
  cf?: { cacheEverything?: boolean; cacheTtl?: number };
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

  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
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
    return !(host === "::1" || host === "::" || /^(f[cd]|fe[89ab])/.test(host) || host.startsWith("::ffff:"));
  }

  return host.includes(".");
}

/** Follow redirects by hand so every hop is checked, not only the first. */
async function fetchPublic(url: URL, init: CfRequestInit): Promise<Response> {
  let current = url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await fetch(current.toString(), { ...init, redirect: "manual" });

    if (response.status < 300 || response.status >= 400) {
      return response;
    }

    const location = response.headers.get("location");
    await response.body?.cancel();

    if (!location) {
      return new Response(null, { status: 502 });
    }

    current = new URL(location, current);

    if (!ALLOWED_PROTOCOLS.has(current.protocol) || !isPublicHost(current.hostname)) {
      return new Response(null, { status: 403 });
    }
  }

  return new Response(null, { status: 508 });
}

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const rawUrl = searchParams.get("url");

  if (!rawUrl) {
    return new NextResponse("Missing url parameter", { status: 400 });
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(rawUrl);
  } catch {
    return new NextResponse("Invalid URL", { status: 400 });
  }

  if (!ALLOWED_PROTOCOLS.has(targetUrl.protocol)) {
    return new NextResponse("Forbidden protocol", { status: 403 });
  }

  if (!isPublicHost(targetUrl.hostname)) {
    return new NextResponse("Forbidden host", { status: 403 });
  }

  try {
    const init: CfRequestInit = {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*;q=0.8",
      },
      cf: { cacheEverything: true, cacheTtl: ONE_MONTH },
    };
    const upstreamRes = await fetchPublic(targetUrl, init);

    if (!upstreamRes.ok || !upstreamRes.body) {
      return new NextResponse(`Upstream failed with status ${upstreamRes.status}`, {
        status: upstreamRes.status === 200 ? 502 : upstreamRes.status,
      });
    }

    const contentType = upstreamRes.headers.get("content-type") || "image/jpeg";

    if (!contentType.startsWith("image/")) {
      await upstreamRes.body.cancel();
      return new NextResponse("Upstream is not an image", { status: 415 });
    }

    const length = Number(upstreamRes.headers.get("content-length") ?? "0");

    if (Number.isFinite(length) && length > MAX_BYTES) {
      await upstreamRes.body.cancel();
      return new NextResponse("Upstream too large", { status: 413 });
    }

    const headers = new Headers({
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
      "Access-Control-Allow-Origin": "*",
      "X-Content-Type-Options": "nosniff",
    });

    if (length > 0) {
      headers.set("Content-Length", String(length));
    }

    return new Response(upstreamRes.body, { status: 200, headers });
  } catch {
    return new NextResponse("Failed to fetch upstream media", { status: 502 });
  }
}
