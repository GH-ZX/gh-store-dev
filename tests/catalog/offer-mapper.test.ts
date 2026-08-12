import { describe, expect, it } from "vitest";
import { toStoreOffer } from "@/lib/catalog/offer-mapper";

const row = {
  id: "offer-1",
  slug: "100-points",
  offer_type: "topup" as const,
  name_ar: "100 نقطة",
  name_en: "100 Points",
  description_ar: "باقة بداية.",
  description_en: "A starter pack.",
  price: 2.5,
  original_price: 5,
  currency: "USD",
  is_sale: true,
  region_code: "MENA",
  sale_image_url: null,
};

const gameRelation = {
  slug: "valorant",
  name_ar: "فالورانت",
  name_en: "Valorant",
  image_url: "https://cdn.example/valorant.png",
  logo_url: "https://cdn.example/valorant-logo.png",
};

describe("catalog offer mapper", () => {
  it("localizes offer names and descriptions", () => {
    expect(toStoreOffer(row, "ar")).toMatchObject({
      name: "100 نقطة",
      offerType: "topup",
      description: "باقة بداية.",
      price: 2.5,
      originalPrice: 5,
      currency: "USD",
      isSale: true,
      regionCode: "MENA",
    });
  });

  it("uses English values for the English storefront", () => {
    expect(toStoreOffer(row, "en").name).toBe("100 Points");
    expect(toStoreOffer(row, "en").description).toBe("A starter pack.");
  });

  it("computes a whole-percent discount", () => {
    expect(toStoreOffer(row, "en").discountPercent).toBe(50);
  });

  it("reports no discount when the original price is not higher", () => {
    expect(toStoreOffer({ ...row, original_price: null }, "en").discountPercent).toBeNull();
    expect(toStoreOffer({ ...row, original_price: 2.5 }, "en").discountPercent).toBeNull();
    expect(toStoreOffer({ ...row, original_price: 1 }, "en").discountPercent).toBeNull();
  });

  it("normalizes an unexpected offer type to a top-up", () => {
    expect(toStoreOffer({ ...row, offer_type: "mystery" }, "en").offerType).toBe("topup");
    expect(toStoreOffer({ ...row, offer_type: "redeem_code" }, "en").offerType).toBe("redeem_code");
  });

  it("localizes the joined game and exposes its slug for linking", () => {
    const offer = toStoreOffer({ ...row, games: gameRelation }, "ar");

    expect(offer.game).toEqual({
      slug: "valorant",
      name: "فالورانت",
      imageUrl: "https://cdn.example/valorant.png",
      logoUrl: "https://cdn.example/valorant-logo.png",
    });
  });

  it("accepts a to-one join returned as an array", () => {
    expect(toStoreOffer({ ...row, games: [gameRelation] }, "en").game?.slug).toBe("valorant");
  });

  it("has no game when the read did not join one", () => {
    expect(toStoreOffer(row, "en").game).toBeNull();
    expect(toStoreOffer({ ...row, games: null }, "en").game).toBeNull();
    expect(toStoreOffer({ ...row, games: [] }, "en").game).toBeNull();
  });

  it("prefers the offer's own artwork over the game artwork", () => {
    expect(
      toStoreOffer({ ...row, sale_image_url: "https://cdn.example/sale.png", games: gameRelation }, "en")
        .imageUrl,
    ).toBe("https://cdn.example/sale.png");

    expect(toStoreOffer({ ...row, games: gameRelation }, "en").imageUrl).toBe(
      "https://cdn.example/valorant.png",
    );

    expect(toStoreOffer(row, "en").imageUrl).toBeNull();
  });
});
