import { describe, expect, it } from "vitest";
import { isSettledOrderStatus } from "@/lib/orders/order-status";

describe("settled order statuses", () => {
  it("closes an order that has already been delivered", () => {
    expect(isSettledOrderStatus("completed")).toBe(true);
  });

  it("closes an order whose money has been returned", () => {
    expect(isSettledOrderStatus("refunded")).toBe(true);
    expect(isSettledOrderStatus("cancelled")).toBe(true);
  });

  it("leaves an unfinished order open to a retry", () => {
    for (const status of ["pending", "payment_pending", "paid", "processing", "fulfilling"]) {
      expect(isSettledOrderStatus(status)).toBe(false);
    }
  });

  it("leaves a failed order open, because a retry is exactly what it needs", () => {
    expect(isSettledOrderStatus("failed")).toBe(false);
  });

  it("treats an unknown status as open rather than silently blocking delivery", () => {
    expect(isSettledOrderStatus("something_new")).toBe(false);
  });
});
