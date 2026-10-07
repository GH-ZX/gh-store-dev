import { afterEach, describe, expect, it, vi } from "vitest";
import { loader } from "../../storefront/app/routes/media-proxy";

afterEach(() => vi.unstubAllGlobals());

const ORIGIN = "https://api.g2bulk.com/images/deltaforce.png";
const ORIGIN_PARAM = encodeURIComponent(ORIGIN);

/** A minimal PNG head so the proxy's magic-byte check sees a real image. */
const PNG_HEAD = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
/** A minimal WebP head (RIFF....WEBP). */
const WEBP_HEAD = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x10, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0, 0, 0, 0,
]);

function upstream(head: Uint8Array, headers: Record<string, string>): Response {
  return new Response(head, { headers: { "content-length": String(head.byteLength), ...headers } });
}

function proxied(suffix: string): Request {
  return new Request(`https://store.example/api/media-proxy?url=${ORIGIN_PARAM}${suffix}`);
}

describe("catalog image proxy", () => {
  it.each(["", "&width=0", "&width=invalid", "&width=-10", "&width=Infinity"])(
    "keeps original image size when no valid resize was requested (%s)",
    async (suffix) => {
      const fetchImage = vi
        .fn()
        .mockResolvedValue(upstream(PNG_HEAD, { "content-type": "image/png" }));
      vi.stubGlobal("fetch", fetchImage);
      const response = await loader({ request: proxied(suffix) });
      expect(response.status).toBe(200);
      expect(fetchImage.mock.calls[0][1].cf).not.toHaveProperty("image");
      expect(response.headers.get("content-type")).toBe("image/png");
      expect(response.headers.get("content-length")).toBe(String(PNG_HEAD.byteLength));
      expect(response.headers.get("x-media-resized")).toBe("passthrough");
    },
  );

  it("uses the requested bounded width and preserves the actual returned media type", async () => {
    const fetchImage = vi
      .fn()
      .mockResolvedValue(upstream(WEBP_HEAD, { "content-type": "image/webp" }));
    vi.stubGlobal("fetch", fetchImage);
    const response = await loader({ request: proxied("&width=640") });
    expect(fetchImage.mock.calls[0][1].cf.image.width).toBe(640);
    expect(fetchImage.mock.calls[0][1].cf.image.format).toBe("webp");
    expect(fetchImage.mock.calls[0][1].cf.image.quality).toBe(76);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("x-media-resized")).toBe("cf-image");
    expect(response.headers.get("x-media-variant")).toBe("640w-q76-webp");
  });

  it("clamps an out-of-range width and quality instead of forwarding them", async () => {
    const fetchImage = vi
      .fn()
      .mockResolvedValue(upstream(WEBP_HEAD, { "content-type": "image/webp" }));
    vi.stubGlobal("fetch", fetchImage);
    await loader({ request: proxied("&width=99999&quality=999") });
    expect(fetchImage.mock.calls[0][1].cf.image.width).toBe(1920);
    expect(fetchImage.mock.calls[0][1].cf.image.quality).toBe(90);
  });

  it("falls back to the raw proxied bytes when the resizing binding is unavailable", async () => {
    // The resizer answers 404 on a zone without the feature — the image must
    // still be served, unoptimised, rather than becoming a broken <img>.
    const fetchImage = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(upstream(PNG_HEAD, { "content-type": "image/png" }));
    vi.stubGlobal("fetch", fetchImage);
    const response = await loader({ request: proxied("&width=320") });
    expect(response.status).toBe(200);
    expect(fetchImage).toHaveBeenCalledTimes(2);
    expect(fetchImage.mock.calls[0][1].cf.image.width).toBe(320);
    expect(fetchImage.mock.calls[1][1].cf).not.toHaveProperty("image");
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("x-media-resized")).toBe("passthrough");
  });

  it("falls back when the resizer throws instead of returning a response", async () => {
    const fetchImage = vi
      .fn()
      .mockRejectedValueOnce(new Error("resize unavailable"))
      .mockResolvedValueOnce(upstream(PNG_HEAD, { "content-type": "image/png" }));
    vi.stubGlobal("fetch", fetchImage);
    const response = await loader({ request: proxied("&width=320") });
    expect(response.status).toBe(200);
    expect(response.headers.get("x-media-resized")).toBe("passthrough");
  });

  it("corrects a resizer that passes the original bytes through under a webp label", async () => {
    const fetchImage = vi
      .fn()
      .mockResolvedValue(upstream(PNG_HEAD, { "content-type": "image/webp" }));
    vi.stubGlobal("fetch", fetchImage);
    const response = await loader({ request: proxied("&width=320") });
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("x-media-resized")).toBe("passthrough");
    // A corrected type is still the same origin bytes, so it stays cacheable.
    expect(response.headers.get("cache-control")).toContain("immutable");
  });

  it("never sends a vector document to the browser as an image", async () => {
    const svgBytes = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const fetchImage = vi.fn().mockImplementation(async () =>
      new Response(svgBytes, { headers: { "content-type": "image/svg+xml" } }),
    );
    vi.stubGlobal("fetch", fetchImage);
    const response = await loader({
      request: new Request(
        `https://store.example/api/media-proxy?url=${encodeURIComponent("https://cdn.simpleicons.org/nordvpn")}&width=320`,
      ),
    });
    // The resize attempt is discarded and the markup is refused, not relabelled.
    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(fetchImage.mock.calls[0][1].cf.image.width).toBe(320);
    expect(fetchImage.mock.calls[1][1].cf).not.toHaveProperty("image");
  });

  it("refuses an HTML error page that claims to be an image", async () => {
    const html = new TextEncoder().encode("<!doctype html><html><body>rate limited</body></html>");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => new Response(html, { headers: { "content-type": "image/svg+xml" } })),
    );
    const response = await loader({ request: proxied("") });
    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("serves an original that is already beyond the resizer's reach", async () => {
    const svgBytes = new TextEncoder().encode("<svg/>");
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response(svgBytes, { headers: { "content-type": "image/svg+xml" } })));
    const direct = await loader({
      request: new Request(
        `https://store.example/api/media-proxy?url=${encodeURIComponent("https://cdn.simpleicons.org/figma.svg")}`,
      ),
    });
    expect(direct.status).toBe(502);
  });

  it("rejects non-image upstream responses without caching them", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("<html>error</html>", { headers: { "content-type": "text/html" } })),
    );
    const response = await loader({ request: proxied("") });
    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("refuses a host outside the reviewed media allow-list before fetching", async () => {
    const fetchImage = vi.fn();
    vi.stubGlobal("fetch", fetchImage);
    for (const host of [
      "https://www.google.com/s2/favicons?domain=manus.im&sz=128",
      "https://images.g2a.com/323x433/1x1x1/nordvpn-p10000510606/0fb6dbe855e54461bca30153",
      "https://evil.example/x.png",
    ]) {
      const response = await loader({
        request: new Request(`https://store.example/api/media-proxy?url=${encodeURIComponent(host)}`),
      });
      expect(response.status).toBe(403);
    }
    expect(fetchImage).not.toHaveBeenCalled();
  });
});

describe("proxied image cache correctness", () => {
  it("publishes an immutable, edge-cacheable variant with a stable ETag and no Vary", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => upstream(WEBP_HEAD, { "content-type": "image/webp" })),
    );
    const first = await loader({ request: proxied("&width=320") });
    expect(first.headers.get("cache-control")).toBe(
      "public, max-age=31536000, s-maxage=31536000, immutable",
    );
    expect(first.headers.get("vary")).toBeNull();
    expect(first.headers.get("etag")).toMatch(/^"[a-z0-9]+"$/);
    expect(first.headers.get("content-security-policy")).toContain("sandbox");

    const etag = first.headers.get("etag")!;
    const second = await loader({
      request: new Request(
        `https://store.example/api/media-proxy?url=${ORIGIN_PARAM}&width=320`,
        { headers: { "if-none-match": etag } },
      ),
    });
    expect(second.status).toBe(304);
    expect(second.headers.get("etag")).toBe(etag);
  });

  it("gives each render-slot variant its own ETag, so a shared cache cannot mix them", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(upstream(WEBP_HEAD, { "content-type": "image/webp" })),
    );
    const small = await loader({ request: proxied("&width=320") });
    const large = await loader({ request: proxied("&width=640") });
    expect(small.headers.get("etag")).not.toBe(large.headers.get("etag"));
    expect(small.headers.get("x-media-variant")).not.toBe(large.headers.get("x-media-variant"));
  });

  it("does not outlive an upstream that forbids caching", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        upstream(WEBP_HEAD, { "content-type": "image/webp", "cache-control": "no-store" }),
      ),
    );
    const response = await loader({ request: proxied("&width=320") });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("etag")).toBeNull();
  });

  it("does not outlive a short upstream max-age", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        upstream(WEBP_HEAD, { "content-type": "image/webp", "cache-control": "public, max-age=600" }),
      ),
    );
    const response = await loader({ request: proxied("&width=320") });
    // A supplier that only vouches for ten minutes must not have its image
    // pinned to every phone for a year.
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("does not serve a bad upstream response as if it were the image", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 503, headers: { "cache-control": "no-store" } })),
    );
    const response = await loader({ request: proxied("&width=320") });
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
