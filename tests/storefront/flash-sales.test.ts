import { describe, expect, it } from "vitest";
import { resolveOfferSalePrice } from "@/lib/catalog/pricing";

describe("Flash sale price resolution and cost safety guard", () => {
  it("keeps regular price when no sale price is set", () => {
    const res = resolveOfferSalePrice({
      regularPrice: 20,
      salePrice: null,
    });
    expect(res.effectivePrice).toBe(20);
    expect(res.isSale).toBe(false);
    expect(res.isFlashSale).toBe(false);
  });

  it("applies active flash sale price when within validity window", () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const res = resolveOfferSalePrice({
      regularPrice: 50,
      salePrice: 35,
      saleStartsAt: yesterday,
      saleEndsAt: tomorrow,
    });
    expect(res.effectivePrice).toBe(35);
    expect(res.isSale).toBe(true);
    expect(res.isFlashSale).toBe(true);
    expect(res.endsAt).toBe(tomorrow);
  });

  it("ignores sale price when the sale has expired", () => {
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const res = resolveOfferSalePrice({
      regularPrice: 50,
      salePrice: 30,
      saleStartsAt: twoDaysAgo,
      saleEndsAt: yesterday,
    });
    expect(res.effectivePrice).toBe(50);
    expect(res.isSale).toBe(false);
    expect(res.isFlashSale).toBe(false);
  });

  it("enforces 2% cost guard over supplier cost in USD", () => {
    // Supplier cost is $40. 40 * 1.02 = 40.80.
    // Sale price requested is $35 (below cost). The guard floors the sale price at $40.80.
    const res = resolveOfferSalePrice({
      regularPrice: 60,
      salePrice: 35,
      supplierCostUsd: 40,
      currency: "USD",
    });
    expect(res.effectivePrice).toBe(40.8);
    expect(res.isSale).toBe(true);
    expect(res.isFlashSale).toBe(true);
  });

  it("allows sale price when it exceeds cost plus 2% guard", () => {
    // Supplier cost is $40. 40 * 1.02 = 40.80.
    // Sale price requested is $45 (safe margin).
    const res = resolveOfferSalePrice({
      regularPrice: 60,
      salePrice: 45,
      supplierCostUsd: 40,
      currency: "USD",
    });
    expect(res.effectivePrice).toBe(45);
    expect(res.isSale).toBe(true);
  });
});
