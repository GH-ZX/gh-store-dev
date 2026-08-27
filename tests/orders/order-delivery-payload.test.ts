import { describe, expect, it } from "vitest";
import { toDeliveredCodes } from "@/lib/services/orders-read.service";

describe("toDeliveredCodes", () => {
  it("reads the canonical items payload", () => {
    expect(toDeliveredCodes({ items: ["CODE-1", " CODE-2 "] })).toEqual(["CODE-1", "CODE-2"]);
  });

  it("reads the legacy stored-product codes payload", () => {
    expect(toDeliveredCodes({ codes: ["CODE-1"] })).toEqual(["CODE-1"]);
  });

  it("extracts common fields from delivered objects", () => {
    expect(toDeliveredCodes({ items: [{ code: "CODE-1" }, { url: "https://example.test" }] })).toEqual([
      "CODE-1",
      "https://example.test",
    ]);
  });

  it("rejects non-array payloads", () => {
    expect(toDeliveredCodes({ items: "CODE-1" })).toEqual([]);
    expect(toDeliveredCodes(null)).toEqual([]);
  });
});
