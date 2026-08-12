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
  original_price: 3,
  currency: "USD",
  is_sale: true,
};

describe("catalog offer mapper", () => {
  it("localizes offer names and descriptions", () => {
    expect(toStoreOffer(row, "ar")).toMatchObject({
      name: "100 نقطة",
      offerType: "topup",
      description: "باقة بداية.",
      price: 2.5,
      originalPrice: 3,
      currency: "USD",
      isSale: true,
    });
  });

  it("uses English values for the English storefront", () => {
    expect(toStoreOffer(row, "en").name).toBe("100 Points");
    expect(toStoreOffer(row, "en").description).toBe("A starter pack.");
  });
});
