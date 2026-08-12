import { describe, expect, it } from "vitest";
import {
  DEFAULT_HOME_LAYOUT,
  getHomeSectionPagePath,
  getHomeSectionSubtitle,
  getHomeSectionTitle,
  HOME_SECTION_LIMIT_MAX,
  normalizeHomeLayout,
} from "@/lib/home/layout";

describe("home layout normalization", () => {
  it("falls back to the default layout when nothing is stored", () => {
    expect(normalizeHomeLayout(null).map((section) => section.type)).toEqual(
      DEFAULT_HOME_LAYOUT.map((section) => section.type),
    );
    expect(normalizeHomeLayout("not an array")).toHaveLength(DEFAULT_HOME_LAYOUT.length);
    expect(normalizeHomeLayout([])).toHaveLength(DEFAULT_HOME_LAYOUT.length);
  });

  it("drops sections with an unknown type instead of rendering them", () => {
    const layout = normalizeHomeLayout([
      { id: "a", type: "games" },
      { id: "b", type: "gaming_accounts" },
      { id: "c", type: "not_a_section" },
      "garbage",
    ]);

    expect(layout.map((section) => section.type)).toEqual(["games"]);
  });

  it("keeps only the first instance of a singleton section", () => {
    const layout = normalizeHomeLayout([
      { id: "one", type: "carousel" },
      { id: "two", type: "carousel" },
      { id: "three", type: "sale_offers" },
      { id: "four", type: "sale_offers" },
    ]);

    expect(layout.map((section) => section.id)).toEqual(["one", "three", "four"]);
  });

  it("drops a duplicate id so React keys stay unique", () => {
    const layout = normalizeHomeLayout([
      { id: "same", type: "sale_offers" },
      { id: "same", type: "suggested_offers" },
    ]);

    expect(layout).toHaveLength(1);
    expect(layout[0].type).toBe("sale_offers");
  });

  it("clamps limits and rotation intervals into a safe range", () => {
    const [tooBig, tooSmall] = normalizeHomeLayout([
      { id: "a", type: "sale_offers", limit: 9999, interval_seconds: 9999 },
      { id: "b", type: "suggested_offers", limit: -4, interval_seconds: 0 },
    ]);

    expect(tooBig.limit).toBe(HOME_SECTION_LIMIT_MAX);
    expect(tooBig.intervalSeconds).toBe(30);
    expect(tooSmall.limit).toBe(1);
    expect(tooSmall.intervalSeconds).toBe(3);
  });

  it("keeps disabled sections but restores defaults when every section is off", () => {
    const partiallyDisabled = normalizeHomeLayout([
      { id: "a", type: "games", enabled: false },
      { id: "b", type: "sale_offers" },
    ]);

    expect(partiallyDisabled).toHaveLength(2);
    expect(partiallyDisabled[0].enabled).toBe(false);

    const allDisabled = normalizeHomeLayout([
      { id: "a", type: "games", enabled: false },
      { id: "b", type: "sale_offers", enabled: false },
    ]);

    expect(allDisabled).toHaveLength(DEFAULT_HOME_LAYOUT.length);
    expect(allDisabled.every((section) => section.enabled)).toBe(true);
  });

  it("ignores malformed picked ids and keeps well-formed ones", () => {
    const [section] = normalizeHomeLayout([
      {
        id: "picks",
        type: "game_picks",
        game_ids: ["3f1a6f0e-1c6b-4a3f-9d2e-9f7c2f5b1a11"],
      },
    ]);

    expect(section.gameIds).toEqual(["3f1a6f0e-1c6b-4a3f-9d2e-9f7c2f5b1a11"]);

    const [invalid] = normalizeHomeLayout([{ id: "picks", type: "game_picks", game_ids: ["nope"] }]);

    expect(invalid.gameIds).toEqual([]);
  });

  it("prefers an admin title and falls back to the built-in one", () => {
    const [custom, fallback] = normalizeHomeLayout([
      { id: "a", type: "games", title_ar: "ألعابنا", title_en: "Our games" },
      { id: "b", type: "sale_offers" },
    ]);

    expect(getHomeSectionTitle(custom, "ar")).toBe("ألعابنا");
    expect(getHomeSectionTitle(custom, "en")).toBe("Our games");
    expect(getHomeSectionTitle(fallback, "ar")).toBe("عروض وخصومات");
    expect(getHomeSectionSubtitle(fallback, "en")).toBe("");
  });

  it("maps sections to their catalog page, or to none", () => {
    const layout = normalizeHomeLayout([
      { id: "a", type: "games" },
      { id: "b", type: "gift_cards" },
      { id: "c", type: "sale_offers" },
      { id: "d", type: "customer_reviews" },
    ]);

    expect(layout.map(getHomeSectionPagePath)).toEqual(["/games", "/gift-cards", "/sale", null]);
  });
});
