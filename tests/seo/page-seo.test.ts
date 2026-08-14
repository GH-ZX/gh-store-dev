import { describe, expect, it } from "vitest";
import { normalizePageSeo, resolvePageSeo, type PageSeoMap } from "@/lib/settings/page-seo";

const fallback = { title: "Games", description: "Every game we carry." };

describe("reading stored per-page SEO", () => {
  it("keeps an entry for a page that exists", () => {
    const map = normalizePageSeo({
      "/games": { title_en: "Buy game top-ups", description_en: "Instant delivery." },
    });

    expect(map["/games"]).toMatchObject({
      titleEn: "Buy game top-ups",
      descriptionEn: "Instant delivery.",
      titleAr: "",
    });
  });

  it("drops a key for a route that cannot be reached", () => {
    // Only from a hand edit or a page that has since gone. Keeping it would make
    // the editor show fields that change nothing.
    expect(normalizePageSeo({ "/nowhere": { title_en: "x" } })).toEqual({});
  });

  it("drops an entry with nothing in it", () => {
    expect(normalizePageSeo({ "/faq": { title_en: "  ", description_ar: "" } })).toEqual({});
  });

  it("survives a hand-edited blob", () => {
    expect(normalizePageSeo(null)).toEqual({});
    expect(normalizePageSeo("nonsense")).toEqual({});
    expect(normalizePageSeo([{ title_en: "x" }])).toEqual({});
    expect(normalizePageSeo({ "/faq": "nonsense" })).toEqual({});
  });
});

describe("what a page ends up saying", () => {
  const map: PageSeoMap = {
    "/games": {
      titleAr: "شحن الألعاب",
      titleEn: "",
      descriptionAr: "",
      descriptionEn: "Top up in minutes.",
    },
  };

  it("uses the override for the language it was written in", () => {
    expect(resolvePageSeo(map, "/games", "ar", fallback).title).toBe("شحن الألعاب");
    expect(resolvePageSeo(map, "/games", "en", fallback).description).toBe("Top up in minutes.");
  });

  it("falls back field by field, not all or nothing", () => {
    // An owner who writes only the Arabic title still gets the page's own
    // English title, rather than an empty one.
    expect(resolvePageSeo(map, "/games", "en", fallback).title).toBe(fallback.title);
    expect(resolvePageSeo(map, "/games", "ar", fallback).description).toBe(fallback.description);
  });

  it("leaves a page with no entry exactly as it was", () => {
    expect(resolvePageSeo(map, "/faq", "en", fallback)).toEqual(fallback);
    expect(resolvePageSeo({}, "/games", "en", fallback)).toEqual(fallback);
  });

  it("ignores a path that is not one of the settable pages", () => {
    expect(resolvePageSeo(map, "/games/valorant", "en", fallback)).toEqual(fallback);
  });
});
