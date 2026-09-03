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

  // Never let the proxy be pointed back at itself or at private ranges.
  const host = targetUrl.hostname;
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1)/.test(host)
  ) {
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
    const upstreamRes = await fetch(targetUrl.toString(), init);

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
