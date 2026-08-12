import type { Metadata } from "next";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildAbsoluteUrl, buildAlternates, buildLocalePath, buildPageMetadata } from "@/lib/seo";

/**
 * Next's `Twitter` type is a union whose base variant has no `card`, so narrow
 * before reading it rather than casting.
 */
function twitterCard(metadata: Metadata): string | undefined {
  const twitter = metadata.twitter;

  return twitter && "card" in twitter ? twitter.card : undefined;
}

const ORIGINAL_APP_URL = process.env.NEXT_PUBLIC_APP_URL;

beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = "https://ghstore.example/";
});

afterEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = ORIGINAL_APP_URL;
});

describe("localized paths", () => {
  it("prefixes the locale and normalizes slashes", () => {
    expect(buildLocalePath("ar")).toBe("/ar");
    expect(buildLocalePath("ar", "/")).toBe("/ar");
    expect(buildLocalePath("en", "games")).toBe("/en/games");
    expect(buildLocalePath("en", "/games/")).toBe("/en/games");
  });

  it("strips a trailing slash from the configured site URL", () => {
    expect(buildAbsoluteUrl("ar", "/games")).toBe("https://ghstore.example/ar/games");
  });
});

describe("language alternates", () => {
  it("lists every locale plus an x-default pointing at Arabic", () => {
    const alternates = buildAlternates("en", "/games");

    expect(alternates?.canonical).toBe("/en/games");
    expect(alternates?.languages).toEqual({
      ar: "/ar/games",
      en: "/en/games",
      "x-default": "/ar/games",
    });
  });
});

describe("page metadata", () => {
  it("builds Open Graph and canonical data for a page", () => {
    const metadata = buildPageMetadata({
      locale: "ar",
      path: "/games",
      title: "الألعاب",
      description: "كتالوج الألعاب",
    });

    expect(metadata.title).toBe("الألعاب");
    expect(metadata.openGraph?.url).toBe("https://ghstore.example/ar/games");
    expect(metadata.openGraph?.locale).toBe("ar_SY");
    expect(metadata.robots).toBeUndefined();
  });

  it("marks a page as noindex when asked, without blocking crawl of its links", () => {
    const metadata = buildPageMetadata({
      locale: "en",
      path: "/search",
      title: "Search",
      description: "Search the catalog",
      noIndex: true,
    });

    expect(metadata.robots).toEqual({ index: false, follow: true });
  });

  it("uses a large image card only when an image exists", () => {
    expect(twitterCard(buildPageMetadata({ locale: "en", title: "A", description: "B" }))).toBe(
      "summary",
    );
    expect(
      twitterCard(
        buildPageMetadata({
          locale: "en",
          title: "A",
          description: "B",
          imageUrl: "https://img.example/a.png",
        }),
      ),
    ).toBe("summary_large_image");
  });
});
