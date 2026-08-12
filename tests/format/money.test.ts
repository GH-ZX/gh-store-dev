import { describe, expect, it } from "vitest";
import { formatNumber, formatPrice, lowestPrice } from "@/lib/format/money";

describe("price formatting", () => {
  it("uses Latin digits for Arabic prices", () => {
    const formatted = formatPrice(12.5, "USD", "ar");

    expect(formatted).toMatch(/12/);
    expect(formatted).not.toMatch(/[٠-٩]/);
  });

  it("formats English prices with a symbol", () => {
    expect(formatPrice(12.5, "USD", "en")).toBe("$12.50");
  });

  it("does not crash on an unknown currency code from provider data", () => {
    expect(() => formatPrice(5, "XYZ", "en")).not.toThrow();
    expect(formatPrice(5, "XYZ", "en")).toMatch(/5/);
  });

  it("formats plain numbers with Latin digits in Arabic", () => {
    expect(formatNumber(1500, "ar")).toMatch(/1/);
    expect(formatNumber(1500, "en")).toBe("1,500");
  });
});

describe("lowest price", () => {
  it("finds the cheapest offer", () => {
    expect(lowestPrice([{ price: 9 }, { price: 3 }, { price: 5 }])).toEqual({ price: 3 });
  });

  it("returns null for an empty list", () => {
    expect(lowestPrice([])).toBeNull();
  });
});
