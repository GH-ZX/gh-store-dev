import { describe, expect, it } from "vitest";
import { hasContent } from "@/lib/logging/fields";

describe("event field emptiness", () => {
  it("keeps ordinary values, including falsy ones that mean something", () => {
    expect(hasContent("GH-2026-0001")).toBe(true);
    expect(hasContent(0)).toBe(true);
    expect(hasContent(false)).toBe(true);
    expect(hasContent("")).toBe(true);
  });

  it("drops nothing", () => {
    expect(hasContent(null)).toBe(false);
    expect(hasContent(undefined)).toBe(false);
  });

  it("drops a column left behind by an earlier event shape", () => {
    /*
     * Axiom keeps every column the dataset has ever seen. Events written before
     * the flat shape landed left a `data` column, which now arrives on every row
     * as an object of nothing but nulls — not as a null.
     */
    expect(hasContent({ actorId: null, area: null, level: null })).toBe(false);
    expect(hasContent({ nested: { deeper: null } })).toBe(false);
    expect(hasContent([null, null])).toBe(false);
    expect(hasContent({})).toBe(false);
  });

  it("keeps a nested object that carries anything at all", () => {
    expect(hasContent({ actorId: null, orderNumber: "GH-1" })).toBe(true);
    expect(hasContent({ nested: { deeper: 0 } })).toBe(true);
    expect(hasContent([null, "value"])).toBe(true);
  });
});
