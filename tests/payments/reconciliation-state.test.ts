import { describe, expect, it } from "vitest";
import {
  needsAttention,
  reconcilePayment,
  type PaymentFacts,
} from "@/lib/payments/reconciliation-state";

const manual: PaymentFacts = {
  requestStatus: "pending",
  invoiceStatus: null,
  credited: false,
  billedAmount: null,
  paidAmount: null,
};

describe("payment reconciliation", () => {
  it("settles a request that was approved and credited", () => {
    expect(reconcilePayment({ ...manual, requestStatus: "approved", credited: true })).toBe(
      "settled",
    );
  });

  it("settles a Sam invoice that credited", () => {
    expect(
      reconcilePayment({
        requestStatus: "approved",
        invoiceStatus: "credited",
        credited: true,
        billedAmount: 10,
        paidAmount: 10,
      }),
    ).toBe("settled");
  });

  it("reports a payment that never reached the wallet", () => {
    expect(
      reconcilePayment({ ...manual, invoiceStatus: "paid", requestStatus: "processing" }),
    ).toBe("not_credited");
  });

  it("still reports paid-but-not-credited when the request has already been cancelled", () => {
    /*
     * The reference store checks `cancelled` first and renders this as an
     * ordinary closed row. It is the worst case there is — the customer's money
     * arrived moments after the request expired — so it must not be filed away
     * as merely closed.
     */
    expect(
      reconcilePayment({ ...manual, requestStatus: "cancelled", invoiceStatus: "paid" }),
    ).toBe("not_credited");

    expect(
      reconcilePayment({ ...manual, requestStatus: "expired", invoiceStatus: "credited" }),
    ).toBe("not_credited");
  });

  it("reports an approval whose credit did not land", () => {
    expect(reconcilePayment({ ...manual, requestStatus: "approved", credited: false })).toBe(
      "not_credited",
    );
  });

  it("reports a wallet credit with no payment behind it", () => {
    // Costs the store rather than the customer, and no status describes it.
    expect(reconcilePayment({ ...manual, requestStatus: "pending", credited: true })).toBe(
      "unbacked",
    );
  });

  it("reports a payment smaller than the amount billed", () => {
    expect(
      reconcilePayment({
        requestStatus: "processing",
        invoiceStatus: "paid",
        credited: false,
        billedAmount: 10,
        paidAmount: 2,
      }),
    ).toBe("short_paid");

    expect(
      reconcilePayment({
        requestStatus: "approved",
        invoiceStatus: "credited",
        credited: true,
        billedAmount: 10,
        paidAmount: 2,
      }),
    ).toBe("short_paid");
  });

  it("does not call an overpayment short", () => {
    expect(
      reconcilePayment({
        requestStatus: "approved",
        invoiceStatus: "credited",
        credited: true,
        billedAmount: 10,
        paidAmount: 12,
      }),
    ).toBe("settled");
  });

  it("treats waiting states as normal, not as faults", () => {
    expect(reconcilePayment(manual)).toBe("open");
    expect(reconcilePayment({ ...manual, requestStatus: "processing" })).toBe("awaiting_review");
    expect(reconcilePayment({ ...manual, invoiceStatus: "awaiting_review" })).toBe(
      "awaiting_review",
    );
    expect(reconcilePayment({ ...manual, requestStatus: "rejected" })).toBe("closed");
    expect(reconcilePayment({ ...manual, requestStatus: "expired" })).toBe("closed");
  });

  it("marks only the disagreements as needing attention", () => {
    expect(needsAttention("not_credited")).toBe(true);
    expect(needsAttention("unbacked")).toBe(true);
    expect(needsAttention("short_paid")).toBe(true);

    for (const fine of ["settled", "awaiting_review", "open", "closed"] as const) {
      expect(needsAttention(fine)).toBe(false);
    }
  });
});
