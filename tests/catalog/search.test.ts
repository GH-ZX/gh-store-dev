import { describe, expect, it } from "vitest";
import {
  buildSearchPath,
  parseSearchFilter,
  parseSearchParams,
  SEARCH_QUERY_MAX_LENGTH,
  toSearchTokens,
} from "@/lib/catalog/search";

describe("search parameter parsing", () => {
  it("accepts known filters and rejects anything else", () => {
    expect(parseSearchFilter("topup")).toBe("topup");
    expect(parseSearchFilter("GIFT_CARD")).toBe("gift_card");
    expect(parseSearchFilter("account")).toBe("all");
    expect(parseSearchFilter(undefined)).toBe("all");
  });

  it("trims and caps the query", () => {
    expect(parseSearchParams({ q: "  pubg  " })).toEqual({ query: "pubg", filter: "all" });
    expect(parseSearchParams({ q: "x".repeat(500) }).query).toHaveLength(SEARCH_QUERY_MAX_LENGTH);
  });

  it("degrades to an empty search instead of throwing on junk input", () => {
    expect(parseSearchParams({ q: ["a", "b"] })).toEqual({ query: "", filter: "all" });
    expect(parseSearchParams(undefined)).toEqual({ query: "", filter: "all" });
  });
});

describe("search tokenization", () => {
  it("splits on whitespace and lowercases", () => {
    expect(toSearchTokens("PUBG  UC")).toEqual(["pubg", "uc"]);
  });

  it("strips characters that would break out of a PostgREST filter group", () => {
    expect(toSearchTokens("pubg,(uc)")).toEqual(["pubg", "uc"]);
    expect(toSearchTokens('a"b\\c')).toEqual(["a", "b", "c"]);
  });

  it("strips LIKE wildcards so a query cannot match everything", () => {
    expect(toSearchTokens("%")).toEqual([]);
    expect(toSearchTokens("free_fire")).toEqual(["free", "fire"]);
  });

  it("deduplicates and caps the token count", () => {
    expect(toSearchTokens("uc uc uc")).toEqual(["uc"]);
    expect(toSearchTokens("a b c d e f g")).toHaveLength(5);
  });

  it("returns nothing for a blank query", () => {
    expect(toSearchTokens("   ")).toEqual([]);
  });

  it("keeps Arabic terms intact", () => {
    expect(toSearchTokens("شحن ببجي")).toEqual(["شحن", "ببجي"]);
  });
});

describe("search paths", () => {
  it("omits empty queries and the default filter", () => {
    expect(buildSearchPath("ar", {})).toBe("/ar/search");
    expect(buildSearchPath("ar", { query: "  " })).toBe("/ar/search");
    expect(buildSearchPath("ar", { query: "uc", filter: "all" })).toBe("/ar/search?q=uc");
  });

  it("keeps a non-default filter in the URL", () => {
    expect(buildSearchPath("en", { query: "steam", filter: "gift_card" })).toBe(
      "/en/search?q=steam&type=gift_card",
    );
  });

  it("encodes query characters", () => {
    expect(buildSearchPath("en", { query: "free fire" })).toBe("/en/search?q=free+fire");
  });
});
