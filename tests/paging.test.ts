import { describe, expect, it } from "vitest";
import { PAGE_SIZE, pageCount, pageRange, parsePage } from "@/lib/paging";

describe("pageCount", () => {
  it("reports one page for an empty list, never zero", () => {
    expect(pageCount(0)).toBe(1);
  });

  it.each([
    [1, 1],
    [PAGE_SIZE, 1],
    [PAGE_SIZE + 1, 2],
    [PAGE_SIZE * 3, 3],
  ])("splits %i rows into %i pages", (total, expected) => {
    expect(pageCount(total)).toBe(expected);
  });
});

describe("pageRange", () => {
  it("is inclusive at both ends, as Supabase's range is", () => {
    expect(pageRange(1, 20)).toEqual({ from: 0, to: 19 });
    expect(pageRange(3, 20)).toEqual({ from: 40, to: 59 });
  });
});

describe("parsePage", () => {
  it.each([
    ["abc", 1],
    ["0", 1],
    ["-4", 1],
    ["", 1],
    [undefined, 1],
    ["2.9", 2],
    ["3", 3],
  ])("reads %s as page %i", (input, expected) => {
    expect(parsePage(input, 25)).toBe(expected);
  });

  it("takes the first value when the param is repeated", () => {
    expect(parsePage(["2", "9"], 25)).toBe(2);
  });

  it("clamps to the ceiling the caller sets", () => {
    expect(parsePage("9999", 25)).toBe(25);
  });
});
