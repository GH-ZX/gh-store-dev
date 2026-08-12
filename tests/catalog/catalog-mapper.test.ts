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
    });
  });

  it("localizes English storefront data", () => {
    expect(toStoreGame(row, "en").name).toBe("Valorant");
    expect(toStoreGame(row, "en").description).toBe("Top up Valorant points.");
  });
});
