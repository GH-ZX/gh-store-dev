import { describe, expect, it } from "vitest";
import {
  callbackEventId,
  classifyCallbackStatus,
  decideCallback,
  type CallbackStatus,
} from "@/lib/orders/g2bulk-callback";

const attempt = (status: string) => ({ status, orderNumber: "GH-1001" });

function decide(status: CallbackStatus, attemptStatus: string, remark: string | null = "GH-1001") {
  return decideCallback({ status, attempt: attempt(attemptStatus), remark });
}

describe("classifying a callback status", () => {
  it("reads the two terminal states the supplier documents", () => {
    expect(classifyCallbackStatus("COMPLETED")).toBe("completed");
    expect(classifyCallbackStatus("FAILED")).toBe("failed");
  });

  it("ignores case and surrounding space, which a payload is free to vary", () => {
    expect(classifyCallbackStatus(" completed ")).toBe("completed");
  });

  it("treats a progress report as no outcome at all", () => {
    // Refusing to guess is the point: reading PENDING as either outcome would
    // either give the goods away or refund an order that is still working.
    expect(classifyCallbackStatus("PENDING")).toBe("unsupported");
    expect(classifyCallbackStatus("PROCESSING")).toBe("unsupported");
  });

  it("survives a payload that carries no status", () => {
    expect(classifyCallbackStatus(undefined)).toBe("unsupported");
    expect(classifyCallbackStatus(42)).toBe("unsupported");
  });
});

describe("deciding what a callback means", () => {
  it("completes an order the supplier says is delivered", () => {
    expect(decide("completed", "processing")).toEqual({ action: "complete" });
  });

  it("refunds an order the supplier says failed", () => {
    expect(decide("failed", "processing").action).toBe("refund");
  });

  it("does nothing the second time the same success arrives", () => {
    expect(decide("completed", "completed")).toEqual({
      action: "ignore",
      reason: "Already completed.",
    });
  });

  it("does nothing the second time the same failure arrives", () => {
    expect(decide("failed", "refunded")).toEqual({ action: "ignore", reason: "Already refunded." });
  });

  it("refuses to refund an order the customer has already been given", () => {
    // The customer was told it was delivered. Reversing that automatically is
    // worse than leaving it for a person who can look at both stories.
    expect(decide("failed", "completed").action).toBe("conflict");
  });

  it("refuses to complete an order that was already refunded", () => {
    expect(decide("completed", "refunded").action).toBe("conflict");
  });

  it("stops when the callback names a different order than the supplier id resolved to", () => {
    const decision = decide("completed", "processing", "GH-2002");

    expect(decision.action).toBe("conflict");
    expect(decision).toHaveProperty("reason", expect.stringContaining("GH-2002"));
  });

  it("accepts a callback that echoes no remark, since the supplier id is the key", () => {
    expect(decide("completed", "processing", null)).toEqual({ action: "complete" });
    expect(decide("completed", "processing", "  ")).toEqual({ action: "complete" });
  });

  it("settles nothing for a status that is not an outcome", () => {
    expect(decide("unsupported", "processing").action).toBe("ignore");
  });
});

describe("the event key that makes a repeat harmless", () => {
  it("is the same for a retry of one event", () => {
    expect(callbackEventId("4821", "completed")).toBe(callbackEventId("4821", "completed"));
  });

  it("separates the two outcomes of one supplier order", () => {
    // A supplier that reports failure and then success must not have the second
    // report swallowed as a duplicate of the first.
    expect(callbackEventId("4821", "completed")).not.toBe(callbackEventId("4821", "failed"));
  });
});
