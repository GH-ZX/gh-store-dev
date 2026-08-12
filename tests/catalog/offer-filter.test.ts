import { describe, expect, it } from "vitest";
import { isGiftCardOffer, isSaleOffer } from "@/lib/catalog/offer-filters";

describe("catalog offer filters", () => {
  it("identifies gift cards and redeem codes", () => {
    expect(isGiftCardOffer({ offerType: "gift_card", isSale: false })).toBe(true);
    expect(isGiftCardOffer({ offerType: "redeem_code", isSale: false })).toBe(true);
    expect(isGiftCardOffer({ offerType: "topup", isSale: false })).toBe(false);
  });

  it("identifies sale offers", () => {
    expect(isSaleOffer({ offerType: "topup", isSale: true })).toBe(true);
    expect(isSaleOffer({ offerType: "gift_card", isSale: false })).toBe(false);
  });
});
