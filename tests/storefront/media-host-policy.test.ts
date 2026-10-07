import { describe, expect, it } from "vitest";
import {
  BLOCKED_MEDIA_HOSTS,
  MEDIA_HOST_ALLOWLIST,
  isAllowedMediaHost,
  isProxyableMediaUrl,
} from "@/lib/media/host-policy";
import { MEDIA_PROXY_VERSION, mediaProxyUrl, resolveImageSource } from "@/lib/images";

describe("media host policy", () => {
  it("allows the hosts the live catalog actually serves artwork from", () => {
    for (const host of [
      "api.g2bulk.com",
      "static.driffle.com",
      "cdn.hesap.com.tr",
      "minio.roboticvn.com",
      "i.postimg.cc",
      "cdn.jsdelivr.net",
      "cdn.simpleicons.org",
      "play-lh.googleusercontent.com",
      "gh-store.me",
    ]) {
      expect(isAllowedMediaHost(host)).toBe(true);
    }
  });

  it("refuses the two hosts the catalog is being migrated off", () => {
    // A favicon API is not brand art, and a competitor's CDN must not be hotlinked.
    for (const host of BLOCKED_MEDIA_HOSTS) {
      expect(isAllowedMediaHost(host)).toBe(false);
      expect(isProxyableMediaUrl(new URL(`https://${host}/x.png`))).toBe(false);
    }
    expect(MEDIA_HOST_ALLOWLIST).not.toContain("images.g2a.com");
    expect(MEDIA_HOST_ALLOWLIST).not.toContain("www.google.com");
  });

  it("refuses an unlisted host and a non-image URL shape", () => {
    expect(isAllowedMediaHost("evil.example")).toBe(false);
    expect(isAllowedMediaHost("")).toBe(false);
    expect(isProxyableMediaUrl(new URL("https://api.g2bulk.com/images/mlbb.png"))).toBe(true);
    expect(isProxyableMediaUrl(new URL("ftp://api.g2bulk.com/x.png"))).toBe(false);
    expect(isProxyableMediaUrl(new URL("https://api.g2bulk.com/"))).toBe(false);
    expect(isProxyableMediaUrl(new URL("https://user:pass@api.g2bulk.com/x.png"))).toBe(false);
  });

  it("treats a subdomain of a listed host as the same supplier", () => {
    expect(isAllowedMediaHost("images.cdn.jsdelivr.net")).toBe(true);
    // A look-alike suffix is not a subdomain.
    expect(isAllowedMediaHost("notg2bulk.com")).toBe(false);
    expect(isAllowedMediaHost("api.g2bulk.com.evil.example")).toBe(false);
  });
});

describe("image source resolution", () => {
  it("keeps local, data and storage sources direct", () => {
    expect(resolveImageSource("/storefront/brands/gemini.svg")).toBe("/storefront/brands/gemini.svg");
    expect(resolveImageSource("data:image/png;base64,AAA")).toBe("data:image/png;base64,AAA");
    expect(resolveImageSource("https://x.supabase.co/storage/v1/object/public/catalog/a.png"))
      .toBe("https://x.supabase.co/storage/v1/object/public/catalog/a.png");
    expect(resolveImageSource(null)).toBeNull();
    expect(resolveImageSource("")).toBeNull();
  });

  it("routes a proxyable host through the variant URL with the version stamp", () => {
    const url = resolveImageSource("https://api.g2bulk.com/images/mlbb.png", 320)!;
    expect(url).toContain("/api/media-proxy?");
    expect(url).toContain(`v=${MEDIA_PROXY_VERSION}`);
    expect(url).toContain("width=320");
    expect(url).toContain(encodeURIComponent("https://api.g2bulk.com/images/mlbb.png"));
  });

  it("serves a refused host from its own origin rather than a 403", () => {
    const competitor = "https://images.g2a.com/323x433/1x1x1/nordvpn-p10000510606/0fb6dbe855e54461bca30153";
    expect(resolveImageSource(competitor, 320)).toBe(competitor);
  });

  it("clamps the requested width to the proxy's own bound", () => {
    expect(mediaProxyUrl("https://api.g2bulk.com/images/mlbb.png", 99_999)).toContain("width=1920");
    expect(mediaProxyUrl("https://api.g2bulk.com/images/mlbb.png", 1)).toContain("width=16");
    // No width means the raw proxied original, which is what a fallback wants.
    expect(mediaProxyUrl("https://api.g2bulk.com/images/mlbb.png")).not.toContain("width=");
  });
});
