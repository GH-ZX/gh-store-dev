import { describe, expect, it } from "vitest";
import { resolveSamPaidAmount } from "@/lib/services/sam-recharge.service";

/**
 * The paid-figure policy is the last line before crediting: whatever this
 * function returns is the number the database is asked to settle against. Every
 * case here encodes a way a real underpayment could slip through if the answer
 * were ever "the figure we billed".
 */
describe("resolveSamPaidAmount", () => {
  it("prefers the explicit paid figure over the invoiced one", () => {
    expect(resolveSamPaidAmount({ paidAmount: 4, amount: 10 })).toBe(4);
  });

  it("falls back to Sam's own invoiced amount when no paid figure exists", () => {
    // Provider-reported evidence — what the transfer was quoted as.
    expect(resolveSamPaidAmount({ paidAmount: null, amount: 10 })).toBe(10);
  });

  it("returns null when Sam reports nothing usable", () => {
    expect(resolveSamPaidAmount({ paidAmount: null, amount: null })).toBeNull();
  });

  it("treats zero and negative figures as no answer", () => {
    expect(resolveSamPaidAmount({ paidAmount: 0, amount: 0 })).toBeNull();
    expect(resolveSamPaidAmount({ paidAmount: -5, amount: 0 })).toBeNull();
  });

  it("refuses non-numeric garbage rather than coercing it", () => {
    expect(
      resolveSamPaidAmount({
        paidAmount: Number.NaN as unknown as number,
        amount: undefined as unknown as number | null,
      }),
    ).toBeNull();
  });
});
