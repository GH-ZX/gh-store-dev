import { describe, expect, it } from "vitest";
import { createHomeSection, getHomeSectionPagePath } from "@/lib/home/layout";

describe("homepage section links", () => {
  it("keeps configured product and offer picks linked to their collections", () => {
    expect(getHomeSectionPagePath(createHomeSection("product_picks", "picks"))).toBe("/products");
    expect(getHomeSectionPagePath(createHomeSection("games", "games"))).toBe("/games");
    expect(getHomeSectionPagePath(createHomeSection("offer_picks", "offers"))).toBe("/products");
    expect(getHomeSectionPagePath(createHomeSection("sale_offers", "sale"))).toBe("/sale");
  });
});
