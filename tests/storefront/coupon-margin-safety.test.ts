import { describe, expect, it } from "vitest";
import { discountCeiling, MINIMUM_STORE_MARGIN_RATE } from "../../storefront/app/.server/lib/services/coupon.service";

describe("coupon safety and 2% minimum margin guard", () => {
  it("enforces MINIMUM_STORE_MARGIN_RATE of 2%", () => {
    expect(MINIMUM_STORE_MARGIN_RATE).toBe(0.02);
  });

  it("calculates discount ceiling strictly preserving 2% profit margin over product price", () => {
    // Product price $100.00, supplier cost $80.00
    // Minimum 2% margin on $100.00 = $2.00
    // Max discount allowed = $100.00 - $80.00 - $2.00 = $18.00
    const ceiling = discountCeiling(100.0, 1, 80.0);
    expect(ceiling).toBe(18.0);
  });

  it("returns zero discount headroom if selling price does not cover supplier cost + 2%", () => {
    // Product price $10.00, supplier cost $9.90
    // Required 2% margin = $0.20, total floor = $10.10 > $10.00
    // Ceiling must be 0 (no coupon discount allowed)
    const ceiling = discountCeiling(10.0, 1, 9.9);
    expect(ceiling).toBe(0);
  });

  it("scales ceiling across multiple units preserving the 2% margin on each unit", () => {
    // Unit price $50.00, cost $40.00, quantity 3
    // Per unit 2% margin = $1.00
    // Per unit discount headroom = $50.00 - $40.00 - $1.00 = $9.00
    // Total headroom for 3 units = $27.00
    const ceiling = discountCeiling(50.0, 3, 40.0);
    expect(ceiling).toBe(27.0);
  });

  it("allows stored delivery items without provider cost up to the full item value", () => {
    // Unit price $20.00, stored delivery (already purchased warehouse inventory)
    const ceiling = discountCeiling(20.0, 1, null, true);
    expect(ceiling).toBe(20.0);
  });
});
