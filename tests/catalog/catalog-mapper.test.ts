import { describe, expect, it } from "vitest";
import { toStoreGame } from "@/lib/catalog/game-mapper";

const row = {
  id: "game-1",
  slug: "valorant",
  name_ar: "فالورانت",
  name_en: "Valorant",
  description_ar: "اشحن نقاط فالورانت.",
  description_en: "Top up Valorant points.",
  points_name_ar: "نقاط",
  points_name_en: "Points",
  image_url: null,
  logo_url: null,
  is_featured: true,
  carousel_badge_ar: "الأكثر طلبًا",
  carousel_badge_en: "Most wanted",
  carousel_focus_x: 30,
  carousel_focus_y: 20,
};

describe("catalog game mapper", () => {
  it("localizes Arabic storefront data", () => {
    expect(toStoreGame(row, "ar")).toEqual({
      id: "game-1",
      slug: "valorant",
      name: "فالورانت",
      description: "اشحن نقاط فالورانت.",
      pointsName: "نقاط",
      imageUrl: null,
      logoUrl: null,
      isFeatured: true,
      carouselBadge: "الأكثر طلبًا",
      carouselFocus: { x: 30, y: 20 },
    });
  });

  it("localizes English storefront data", () => {
    const game = toStoreGame(row, "en");

    expect(game.name).toBe("Valorant");
    expect(game.description).toBe("Top up Valorant points.");
    expect(game.carouselBadge).toBe("Most wanted");
  });

  it("centres artwork when no focus point is set", () => {
    const game = toStoreGame({ ...row, carousel_focus_x: null, carousel_focus_y: undefined }, "en");

    expect(game.carouselFocus).toEqual({ x: 50, y: 50 });
  });

  it("clamps an out-of-range focus point", () => {
    const game = toStoreGame({ ...row, carousel_focus_x: 180, carousel_focus_y: -20 }, "en");

    expect(game.carouselFocus).toEqual({ x: 100, y: 0 });
  });

  it("treats a missing badge as no badge", () => {
    expect(toStoreGame({ ...row, carousel_badge_en: null }, "en").carouselBadge).toBeNull();
  });
});
