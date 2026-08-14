import { describe, expect, it } from "vitest";
import {
  decideReconciliation,
  GRACE_MINUTES,
  MISSING_MINUTES,
  minutesSince,
  STALE_MINUTES,
  type ReconcileInput,
} from "@/lib/orders/reconciliation-policy";

const base: ReconcileInput = {
  providerState: "pending",
  refunded: false,
  hasExternalOrderId: true,
  ageMinutes: GRACE_MINUTES + 1,
};

describe("reconciliation policy", () => {
  it("leaves a young order alone, whatever the supplier says", () => {
    // Checkout may still be placing it; a sweep must not reason about an order
    // that is mid-flight.
    for (const providerState of ["completed", "failed", "pending", null] as const) {
      expect(
        decideReconciliation({ ...base, providerState, ageMinutes: GRACE_MINUTES - 1 }),
      ).toEqual({ action: "wait" });
    }
  });

  it("completes an order the supplier says it completed", () => {
    expect(decideReconciliation({ ...base, providerState: "completed" })).toEqual({
      action: "complete",
    });
  });

  it("fails an order the supplier says it failed", () => {
    expect(decideReconciliation({ ...base, providerState: "failed" }).action).toBe("fail");
  });

  it("treats a supplier-side refund as terminal even when the status says otherwise", () => {
    expect(
      decideReconciliation({ ...base, providerState: "completed", refunded: true }).action,
    ).toBe("fail");
  });

  it("waits while the supplier is still working", () => {
    expect(decideReconciliation(base)).toEqual({ action: "wait" });
  });

  it("escalates rather than settling when no supplier order was recorded", () => {
    /*
     * The purchase either never happened or its reply was lost. Refunding would
     * give away a top-up the customer may already have; completing would hand
     * over goods nobody bought. Only a human can tell.
     */
    const decision = decideReconciliation({ ...base, hasExternalOrderId: false });

    expect(decision.action).toBe("escalate");
  });

  it("does not escalate a missing supplier order until it has had time to appear", () => {
    // The order list is paginated and a busy store pushes rows off it.
    expect(
      decideReconciliation({ ...base, providerState: null, ageMinutes: MISSING_MINUTES - 1 }),
    ).toEqual({ action: "wait" });

    expect(
      decideReconciliation({ ...base, providerState: null, ageMinutes: MISSING_MINUTES }).action,
    ).toBe("escalate");
  });

  it("escalates a pending order that has waited too long", () => {
    // The classifier reports anything unrecognised as pending, so without an
    // age backstop an order could wait for a terminal state that never comes.
    expect(decideReconciliation({ ...base, ageMinutes: STALE_MINUTES - 1 })).toEqual({
      action: "wait",
    });

    expect(decideReconciliation({ ...base, ageMinutes: STALE_MINUTES }).action).toBe("escalate");
  });

  it("never completes or fails on age alone", () => {
    const aged = decideReconciliation({ ...base, ageMinutes: STALE_MINUTES * 10 });

    expect(aged.action).not.toBe("complete");
    expect(aged.action).not.toBe("fail");
  });
});

describe("minutesSince", () => {
  const now = Date.parse("2026-08-13T12:00:00.000Z");

  it("measures elapsed minutes", () => {
    expect(minutesSince("2026-08-13T11:30:00.000Z", now)).toBe(30);
  });

  it("treats a missing or unreadable timestamp as brand new, so nothing settles on it", () => {
    expect(minutesSince(null, now)).toBe(0);
    expect(minutesSince("not a date", now)).toBe(0);
  });

  it("never reports negative age for a clock that runs ahead", () => {
    expect(minutesSince("2026-08-13T12:30:00.000Z", now)).toBe(0);
  });
});
