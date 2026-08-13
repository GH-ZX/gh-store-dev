import { describe, expect, it } from "vitest";
import { worstFulfillmentState } from "@/lib/orders/fulfillment-state";

describe("worst fulfilment state", () => {
  it("says nothing when no delivery has been attempted", () => {
    expect(worstFulfillmentState([])).toBeNull();
  });

  it("reports the single state of a single attempt", () => {
    expect(worstFulfillmentState(["completed"])).toBe("completed");
  });

  it("surfaces one failed item inside an otherwise delivered order", () => {
    expect(worstFulfillmentState(["completed", "completed", "failed"])).toBe("failed");
  });

  it("ranks a refund above states that are merely unfinished", () => {
    expect(worstFulfillmentState(["processing", "refunded", "pending"])).toBe("refunded");
  });

  it("ranks a review above a refund, because it is not settled yet", () => {
    expect(worstFulfillmentState(["refunded", "reconcile"])).toBe("reconcile");
  });

  it("prefers unfinished work over completed work", () => {
    expect(worstFulfillmentState(["completed", "processing"])).toBe("processing");
    expect(worstFulfillmentState(["completed", "pending"])).toBe("pending");
  });

  it("surfaces an unrecognised state rather than dropping it", () => {
    expect(worstFulfillmentState(["something_new"])).toBe("something_new");
  });
});
