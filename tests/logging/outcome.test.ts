import { describe, expect, it } from "vitest";
import { outcomeFields, outcomeLevel, sanitisePath } from "@/lib/logging/outcome";

describe("outcomeLevel", () => {
  it("reports a success as info", () => {
    expect(outcomeLevel({ ok: true })).toBe("info");
  });

  it("reports a handled failure as warn, not error", () => {
    /*
     * An insufficient balance is the system working. Reserving `error` for the
     * unplanned is what keeps the errors-only filter on the Logs page worth
     * having.
     */
    expect(outcomeLevel({ ok: false, reason: "insufficient_balance" })).toBe("warn");
  });
});

describe("outcomeFields", () => {
  it("carries the reason on a failure", () => {
    expect(outcomeFields({ ok: false, reason: "too_many" })).toEqual({ reason: "too_many" });
  });

  it("adds nothing to a success", () => {
    // `ok: true` on every successful event is a field that never varies.
    expect(outcomeFields({ ok: true })).toEqual({});
  });
});

describe("sanitisePath", () => {
  it("keeps the route and replaces the identifier", () => {
    expect(sanitisePath("/v1/wallets/shamcash/be1f2c3d4e5f60718293a4b5c6d7e8d0/transactions")).toBe(
      "/v1/wallets/shamcash/:id/transactions",
    );
  });

  it("keeps a version segment, which contains a digit but is not an id", () => {
    // The naive "contains a digit" rule turns /v1/ into /:id/ and throws away
    // the only part worth grouping by.
    expect(sanitisePath("/v1/invoices")).toBe("/v1/invoices");
  });

  it.each([
    ["/pay/123456", "/pay/:id"],
    ["/orders/6f1e2a3b-4c5d-4e6f-8a9b-0c1d2e3f4a5b/delivery", "/orders/:id/delivery"],
    ["/v1/wallets/syriatel/%2B963991234567/balance", "/v1/wallets/syriatel/:id/balance"],
    ["/products/prod_9aXbYcZdWeVfUg/purchase", "/products/:id/purchase"],
  ])("groups %s", (path, expected) => {
    expect(sanitisePath(path)).toBe(expected);
  });

  it("keeps the route words that make an event countable", () => {
    expect(sanitisePath("/games/checkPlayerId")).toBe("/games/checkPlayerId");
    expect(sanitisePath("/getMe")).toBe("/getMe");
    expect(sanitisePath("/games/servers")).toBe("/games/servers");
  });

  it("drops the query string, which is where the rest of the values live", () => {
    expect(sanitisePath("/games/orders?page=1&limit=100")).toBe("/games/orders");
  });
});
