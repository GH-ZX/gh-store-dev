import { describe, expect, it } from "vitest";
import { readCount } from "@/lib/logging/fields";
import { MAX_PAGE, logHref, parseLogView } from "@/lib/logging/log-view";

/**
 * The Logs page keeps its whole state in the URL, which means every one of these
 * values arrives as a string somebody could have typed. None of them may throw.
 */

describe("parseLogView", () => {
  it("defaults to the first page of problem events", () => {
    expect(parseLogView({})).toEqual({ view: "events", page: 1, level: "problems" });
  });

  it("reads a valid view, page and level", () => {
    expect(parseLogView({ view: "actions", page: "3", level: "all" })).toEqual({
      view: "actions",
      page: 3,
      level: "all",
    });
  });

  it("falls back rather than throwing on nonsense", () => {
    expect(parseLogView({ view: "nope", level: "loud" })).toMatchObject({
      view: "events",
      level: "problems",
    });
  });

  it.each([
    ["abc", 1],
    ["0", 1],
    ["-4", 1],
    ["", 1],
    ["2.9", 2],
  ])("clamps page %s to %i", (input, expected) => {
    expect(parseLogView({ page: input }).page).toBe(expected);
  });

  it("caps the page at the paging ceiling", () => {
    // Axiom has no OFFSET, so a deep page is a large query. It has to stop.
    expect(parseLogView({ page: "9999" }).page).toBe(MAX_PAGE);
  });

  it("takes the first value when a param is repeated", () => {
    expect(parseLogView({ view: ["syncs", "actions"] }).view).toBe("syncs");
  });

  it("is case and whitespace tolerant", () => {
    expect(parseLogView({ view: " SYNCS " }).view).toBe("syncs");
  });
});

describe("logHref", () => {
  it("leaves defaults out of the query string", () => {
    expect(logHref({ locale: "en" })).toBe("/en/dashboard/logs");
  });

  it("names only what differs from the default", () => {
    expect(logHref({ locale: "ar", view: "actions", page: 2 })).toBe(
      "/ar/dashboard/logs?view=actions&page=2",
    );
  });

  it("drops the level on views it means nothing to", () => {
    expect(logHref({ locale: "en", view: "syncs", level: "all" })).toBe(
      "/en/dashboard/logs?view=syncs",
    );
  });

  it("keeps the level on the events view", () => {
    expect(logHref({ locale: "en", view: "events", level: "error" })).toBe(
      "/en/dashboard/logs?level=error",
    );
  });
});

describe("readCount", () => {
  it("reads the aggregate out of a legacy bucket total", () => {
    const body = {
      matches: [],
      buckets: { totals: [{ group: {}, aggregations: [{ op: "count", value: 42 }] }] },
    };

    expect(readCount(body)).toBe(42);
  });

  it("falls back to a row when the aggregate came back as one", () => {
    expect(readCount({ matches: [{ data: { count_: 7 } }] })).toBe(7);
  });

  it("reads zero as a real answer", () => {
    const body = { buckets: { totals: [{ aggregations: [{ op: "count", value: 0 }] }] } };

    expect(readCount(body)).toBe(0);
  });

  it.each([
    ["null", null],
    ["a string", "nope"],
    ["an empty object", {}],
    ["empty totals", { buckets: { totals: [] } }],
    ["a total with no aggregations", { buckets: { totals: [{ group: {} }] } }],
    ["a non-numeric value", { buckets: { totals: [{ aggregations: [{ value: "12" }] }] } }],
  ])("returns null for %s", (_label, body) => {
    // Null, not zero: zero claims the dataset is empty, and the caller shows the
    // list without a total instead of showing a total that might be a lie.
    expect(readCount(body)).toBeNull();
  });
});
