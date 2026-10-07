import { describe, expect, it } from "vitest";
import {
  regionQualifiedName,
  regionQualifiedTitle,
  regionVariantOf,
} from "@/components/store/region-notice";
import { summariseAvailability, type AvailabilityEntry } from "@/components/store/availability-notice";

describe("region-qualified product identity", () => {
  const mlbb = { slug: "mlbb", name: "Mobile Legends" };
  const special = { slug: "mlbb-special", name: "Mobile Legends Special" };
  const exclusive = { slug: "mlbb-exclusive", name: "Mobile Legends Exclusive" };
  const unrelated = { slug: "chatgpt-plus-1m-momo-pay-gmail-nw-89", name: "ChatGPT Plus" };

  it("states the region the supplier published, in both locales", () => {
    expect(regionQualifiedName(mlbb, "en")).toBe("Mobile Legends (Global)");
    expect(regionQualifiedName(mlbb, "ar")).toBe("Mobile Legends (عالمية)");
    expect(regionQualifiedTitle(mlbb, "en")).toBe("Mobile Legends — Global");
    expect(regionQualifiedTitle(mlbb, "ar")).toBe("Mobile Legends — عالمية");
  });

  it("leaves the name unqualified where the supplier published no region", () => {
    // G2Bulk names no region for Special/Exclusive: the page says so separately
    // rather than attaching a made-up one to the title.
    expect(regionQualifiedName(special, "en")).toBe("Mobile Legends Special");
    expect(regionQualifiedName(exclusive, "en")).toBe("Mobile Legends Exclusive");
    expect(regionQualifiedTitle(special, "ar")).toBe("Mobile Legends Special");
  });

  it("gives the three MLBB pages three different titles, so they do not compete", () => {
    const titles = [mlbb, special, exclusive].map((product) => regionQualifiedTitle(product, "en"));
    expect(new Set(titles).size).toBe(3);
  });

  it("adds nothing to a product with no recorded regional split", () => {
    expect(regionVariantOf(unrelated)).toBeNull();
    expect(regionQualifiedName(unrelated, "en")).toBe("ChatGPT Plus");
    expect(regionQualifiedTitle(unrelated, "en")).toBe("ChatGPT Plus");
  });
});

describe("availability summary", () => {
  const entry = (over: Partial<AvailabilityEntry>): AvailabilityEntry => ({
    offerId: "o",
    status: "available",
    checkedAt: Date.now(),
    stale: false,
    source: "catalogue-listing",
    priceChanged: false,
    ...over,
  });

  it("returns nothing at all when nothing was checked", () => {
    expect(summariseAvailability(undefined)).toBeNull();
    expect(summariseAvailability({})).toBeNull();
  });

  it("reports a single status when every offer agrees", () => {
    const summary = summariseAvailability({
      a: entry({}),
      b: entry({ offerId: "b" }),
    })!;
    expect(summary.status).toBe("available");
    expect(summary.priceChanged).toBe(false);
  });

  it("falls back to the weaker statement when offers disagree", () => {
    const summary = summariseAvailability({
      a: entry({}),
      b: entry({ offerId: "b", status: "unknown", source: "provider-unreachable" }),
    })!;
    expect(summary.status).toBe("mixed");
  });

  it("surfaces staleness and a moved supplier price instead of hiding them", () => {
    const summary = summariseAvailability({
      a: entry({ stale: true, priceChanged: true }),
      b: entry({ offerId: "b", checkedAt: Date.now() - 60_000 }),
    })!;
    expect(summary.stale).toBe(true);
    expect(summary.priceChanged).toBe(true);
    expect(summary.checkedAt).toBeGreaterThan(Date.now() - 5_000);
  });
});
