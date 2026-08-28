import { NextResponse } from "next/server";

/**
 * Edge Image / Media Proxy & CDN Cache.
 *
 * Fetches artwork from external provider hosts (e.g. api.g2bulk.com, batstore, cdn hosts)
 * and streams it back with long-lived public CDN caching headers.
 *
 * Cloudflare Edge will cache the payload globally after the first hit, reducing
 * response times from ~2000ms down to <30ms and shielding external APIs from request floods.
 */

export const dynamic = "force-dynamic";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

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

  try {
    const upstreamRes = await fetch(targetUrl.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*;q=0.8",
      },
      next: { revalidate: 86400 * 30 },
    });

    if (!upstreamRes.ok) {
      return new NextResponse(`Upstream failed with status ${upstreamRes.status}`, {
        status: upstreamRes.status,
      });
    }

    const contentType = upstreamRes.headers.get("content-type") || "image/jpeg";
    const body = await upstreamRes.arrayBuffer();

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
        "Access-Control-Allow-Origin": "*",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse("Failed to fetch upstream media", { status: 502 });
  }
}
