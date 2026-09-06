import { afterEach, describe, expect, it, vi } from "vitest";
import { loader } from "../../storefront/app/routes/media-proxy";

afterEach(() => vi.unstubAllGlobals());

describe("catalog image proxy", () => {
  it.each(["", "&width=0", "&width=invalid", "&width=-10", "&width=Infinity"])(
    "keeps original image size when no valid resize was requested (%s)",
    async (suffix) => {
      const fetchImage = vi
        .fn()
        .mockResolvedValue(
          new Response(new Uint8Array([1, 2]), {
            headers: { "content-type": "image/png", "content-length": "2" },
          }),
        );
      vi.stubGlobal("fetch", fetchImage);
      const response = await loader({
        request: new Request(
          `https://store.example/api/media-proxy?url=https%3A%2F%2Fimages.example%2Fproduct.png${suffix}`,
        ),
      });
      expect(response.status).toBe(200);
      expect(fetchImage.mock.calls[0][1].cf).not.toHaveProperty("image");
      expect(response.headers.get("content-type")).toBe("image/png");
      expect(response.headers.get("content-length")).toBe("2");
    },
  );

  it("uses the requested bounded width and preserves the actual returned media type", async () => {
    const fetchImage = vi
      .fn()
      .mockResolvedValue(
        new Response(new Uint8Array([1]), {
          headers: { "content-type": "image/webp" },
        }),
      );
    vi.stubGlobal("fetch", fetchImage);
    const response = await loader({
      request: new Request(
        "https://store.example/api/media-proxy?url=https%3A%2F%2Fimages.example%2Fproduct.png&width=640",
      ),
    });
    expect(fetchImage.mock.calls[0][1].cf.image.width).toBe(640);
    expect(response.headers.get("content-type")).toBe("image/webp");
  });

  it("rejects non-image upstream responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("<html>error</html>", {
            headers: { "content-type": "text/html" },
          }),
        ),
    );
    const response = await loader({
      request: new Request(
        "https://store.example/api/media-proxy?url=https%3A%2F%2Fimages.example%2Fproduct.png",
      ),
    });
    expect(response.status).toBe(502);
  });
});
