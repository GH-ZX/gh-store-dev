import { describe, expect, it } from "vitest";
import { supplierMarginUsd, toRetailPrice } from "@/lib/catalog/pricing";
import { offerPricingMapping, supplierCost } from "@server/lib/offer-pricing";

describe("decimal retail markup", () => {
  it.each([
    [1.1, 0, 1.1], [1.09, 0, 1.09], [0.07, 0, 0.07], [25, 12, 28],
    [0.07, 500, 0.42], [1.75, 20, 2.1], [0.88, 15, 1.02], [2.555, 0, 2.56],
    [1.0000000000000002, 0, 1.01], [1, 0.0001, 1.01], [0.0000001, 15, 0.01],
    [999999.99, 500, 5999999.94], [123456.78, 12.5, 138888.88],
    [0, 15, 0], [1, -50, 1], [1, 100000, 6],
  ])("cost %s and markup %s preserve decimal round-up policy", (cost, markup, price) => {
    expect(toRetailPrice({ supplierCostUsd: cost, markupPercent: markup })).toBe(price);
  });
  it.each([Number.NaN, Infinity, -Infinity, -1])("rejects unusable supplier cost %s", (supplierCostUsd) => {
    expect(() => toRetailPrice({ supplierCostUsd, markupPercent: 15 })).toThrow(RangeError);
  });
  it.each([Number.NaN, Infinity, -Infinity])("rejects an unusable markup %s", (markupPercent) => {
    expect(() => toRetailPrice({ supplierCostUsd: 1, markupPercent })).toThrow(RangeError);
  });
  it("does not emit a price that cannot be represented in cents", () => {
    expect(() => toRetailPrice({ supplierCostUsd: Number.MAX_VALUE, markupPercent: 15 })).toThrow(RangeError);
  });
});

describe("supplier margin preview", () => {
  it("uses the current selling price and exposes a loss", () => {
    expect(supplierMarginUsd(12, "USD", 10)).toBe(2);
    expect(supplierMarginUsd(8, "USD", 10)).toBe(-2);
    expect(supplierMarginUsd(10, " usd ", 10)).toBe(0);
    expect(supplierMarginUsd(10, "USD", 0)).toBe(10);
  });
  it.each(["EUR", "SYP", "USDT", ""])("does not invent a conversion for %s retail prices", (currency) => {
    expect(supplierMarginUsd(10, currency, 5)).toBeNull();
  });
  it.each([null, Number.NaN, Infinity, -1])("does not display a margin for unknown or invalid cost %s", (cost) => {
    expect(supplierMarginUsd(10, "USD", cost)).toBeNull();
  });
  it.each([Number.NaN, Infinity, -1])("does not display a margin for an invalid draft price %s", (price) => {
    expect(supplierMarginUsd(price, "USD", 5)).toBeNull();
  });
});

describe("provider pricing selection", () => {
  it.each(["g2bulk", "maxstore", "batstore"])("preserves the real pricing mode and cost for %s", (provider_name) => {
    const mapping = { provider_name, supplier_cost_usd: 2.5, pricing_mode: "fixed" };
    expect(offerPricingMapping([mapping])).toEqual(mapping);
    expect(supplierCost(mapping)).toBe(2.5);
  });
  it("does not guess a cost for missing or conflicting provider mappings", () => {
    expect(supplierCost(offerPricingMapping([]))).toBeNull();
    expect(supplierCost(offerPricingMapping([
      { provider_name: "g2bulk", supplier_cost_usd: 2 },
      { provider_name: "maxstore", supplier_cost_usd: 3 },
    ]))).toBeNull();
  });
});
