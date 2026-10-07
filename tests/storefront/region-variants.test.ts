import { describe, expect, it } from "vitest";
import {
  formatExcludedRegions,
  getRegionVariant,
  isSameRegionFamily,
  regionFamilySlugs,
  regionVariantLabel,
  siblingVariantSlugs,
  withRegionSuffix,
} from "@/lib/catalog/region-variants";

describe("regional variants stay separate", () => {
  it("keeps the three Mobile Legends packages as distinct entries", () => {
    const slugs = regionFamilySlugs("mlbb");
    expect(slugs).toEqual(["mlbb", "mlbb-special", "mlbb-exclusive"]);
    // Each one is its own product: no family member resolves to another's identity.
    for (const slug of slugs) {
      expect(getRegionVariant(slug)?.slug).toBe(slug);
    }
  });

  it("gives each sibling the other two, and never itself", () => {
    expect(siblingVariantSlugs("mlbb").sort()).toEqual(["mlbb-exclusive", "mlbb-special"]);
    expect(siblingVariantSlugs("mlbb-exclusive").sort()).toEqual(["mlbb", "mlbb-special"]);
    expect(siblingVariantSlugs("mlbb")).not.toContain("mlbb");
  });

  it("labels only the regions the supplier actually published", () => {
    // G2Bulk names no region for Special/Exclusive, so neither does the store.
    expect(regionVariantLabel(getRegionVariant("mlbb"), "en")).toContain("Global");
    expect(regionVariantLabel(getRegionVariant("mlbb-special"), "en")).toBeNull();
    expect(regionVariantLabel(getRegionVariant("mlbb-exclusive"), "ar")).toBeNull();
    expect(getRegionVariant("mlbb-special")?.regionUnpublished).toBe(true);

    expect(regionVariantLabel(getRegionVariant("freefire-me"), "en")).toBe("Middle East");
    expect(regionVariantLabel(getRegionVariant("freefire-me"), "ar")).toBe("الشرق الأوسط");
    expect(regionVariantLabel(getRegionVariant("freefire-eu"), "ar")).toBe("أوروبا");
    expect(regionVariantLabel(getRegionVariant("freefire-global"), "en")).toContain("Global");
  });

  it("records the supplier's exclusions for every package that has them", () => {
    expect(getRegionVariant("mlbb")?.excluded).toEqual(["id", "sg", "my", "ph", "ru", "vn"]);
    expect(getRegionVariant("mlbb-special")?.excluded).toEqual(["id"]);
    expect(getRegionVariant("mlbb-exclusive")?.excluded).toEqual(["id", "sg", "my", "ru", "vn"]);
    expect(getRegionVariant("freefire-global")?.excluded).toEqual(["vn", "th", "id", "me"]);
    // Arena Breakout has no regional restriction at all; the fact is recorded so
    // nobody later invents a region for it.
    expect(getRegionVariant("arena-breakout")?.excluded).toEqual([]);
    expect(getRegionVariant("arena-breakout")?.regionUnpublished).toBe(false);
  });

  it("keeps the supplier's own note as the evidence behind the label", () => {
    expect(getRegionVariant("freefire-me")?.supplierNote).toBe("Available for Middle East Users");
    expect(getRegionVariant("mlbb")?.supplierNote).toContain("SG/MY/PH/RU/VN");
  });

  it("treats the Turkish store-credit cards as one locked family", () => {
    const slugs = regionFamilySlugs("turkey-store-credit");
    expect(slugs).toEqual(["psn-turkey", "xbox-gift-card-turkey", "valorant-riot-cash-turkey"]);
    for (const slug of slugs) {
      expect(regionVariantLabel(getRegionVariant(slug), "en")).toBe("Turkey");
      expect(regionVariantLabel(getRegionVariant(slug), "ar")).toBe("تركيا");
    }
  });

  it("does not present unrelated products as region alternatives", () => {
    expect(isSameRegionFamily("mlbb", "mlbb-special")).toBe(true);
    expect(isSameRegionFamily("freefire-me", "freefire-eu")).toBe(true);
    expect(isSameRegionFamily("mlbb", "freefire-me")).toBe(false);
    expect(isSameRegionFamily("mlbb", "proton-vpn-plus-1-month-10-devices-94")).toBe(false);
    expect(siblingVariantSlugs("chatgpt-plus-1m-momo-pay-gmail-nw-89")).toEqual([]);
    expect(getRegionVariant(null)).toBeNull();
    expect(getRegionVariant("not-a-product")).toBeNull();
  });
});

describe("region copy", () => {
  it("renders exclusions as a readable list in both languages", () => {
    expect(formatExcludedRegions(["id", "sg", "my", "ph", "ru", "vn"], "en"))
      .toBe("Indonesia, Singapore, Malaysia, the Philippines, Russia and Vietnam");
    expect(formatExcludedRegions(["id"], "en")).toBe("Indonesia");
    expect(formatExcludedRegions(["id", "vn"], "ar")).toBe("إندونيسيا وفيتنام");
    expect(formatExcludedRegions([], "en")).toBeNull();
    // An unknown code is dropped rather than printed raw.
    expect(formatExcludedRegions(["xx"], "en")).toBeNull();
    expect(formatExcludedRegions(["id", "xx"], "en")).toBe("Indonesia");
  });

  it("qualifies a name with its region without replacing it", () => {
    expect(withRegionSuffix("Mobile Legends", "Global")).toBe("Mobile Legends (Global)");
    expect(withRegionSuffix("PSN Turkey", "Turkey")).toBe("PSN Turkey (Turkey)");
    expect(withRegionSuffix("Mobile Legends Special", null)).toBe("Mobile Legends Special");
  });
});
