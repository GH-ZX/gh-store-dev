import { describe, expect, it } from "vitest";
import { G2BulkError } from "@server/providers/g2bulk/errors";
import { BatStoreError } from "@server/providers/batstore/errors";
import { MaxStoreError } from "@server/providers/maxstore/errors";
import { isLowBalanceError } from "@server/fulfillment/settle";

describe("low balance detection and non-terminal handling", () => {
  it("identifies various supplier balance error messages as low balance", () => {
    expect(isLowBalanceError(new G2BulkError("request", "Insufficient balance"))).toBe(true);
    expect(isLowBalanceError(new G2BulkError("request", "Your balance is not enough"))).toBe(true);
    expect(isLowBalanceError(new G2BulkError("request", "Low balance"))).toBe(true);
    expect(isLowBalanceError(new G2BulkError("request", "رصيد غير كاف"))).toBe(true);
    expect(isLowBalanceError(new BatStoreError("request", "Your balance is not enough"))).toBe(true);
    expect(isLowBalanceError(new MaxStoreError("request", "Insufficient account balance"))).toBe(true);
    expect(isLowBalanceError(new Error("low_funds_on_provider"))).toBe(true);
  });

  it("does not treat customer rejections as low balance errors", () => {
    expect(isLowBalanceError(new G2BulkError("request", "Invalid player id"))).toBe(false);
    expect(isLowBalanceError(new G2BulkError("auth", "Unauthorized"))).toBe(false);
    expect(isLowBalanceError(new Error("server timeout"))).toBe(false);
  });
});
