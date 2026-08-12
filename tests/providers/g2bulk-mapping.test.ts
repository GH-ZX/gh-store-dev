import { describe, expect, it } from "vitest";
import {
  mapInputFields,
  requiresServer,
  resolveProviderImageUrl,
  toGameSlug,
  toOfferSlug,
  toRetailPrice,
  toSlug,
} from "@/providers/g2bulk/mapping";

describe("provider image URLs", () => {
  it("resolves a host-relative path against the provider origin", () => {
    expect(resolveProviderImageUrl("/images/pubg_mobile.png")).toBe(
      "https://api.g2bulk.com/images/pubg_mobile.png",
    );
    expect(resolveProviderImageUrl("images/x.png")).toBe("https://api.g2bulk.com/images/x.png");
  });

  it("leaves an absolute URL alone", () => {
    expect(resolveProviderImageUrl("https://cdn.example/a.png")).toBe("https://cdn.example/a.png");
  });

  it("treats missing or blank artwork as none", () => {
    expect(resolveProviderImageUrl(null)).toBeNull();
    expect(resolveProviderImageUrl("   ")).toBeNull();
  });
});

describe("slugs", () => {
  it("lowercases and hyphenates Latin names", () => {
    expect(toSlug("PUBG Mobile")).toBe("pubg-mobile");
    expect(toSlug("  60 UC  ")).toBe("60-uc");
    expect(toSlug("Free Fire — Diamonds!")).toBe("free-fire-diamonds");
  });

  it("strips diacritics", () => {
    expect(toSlug("Pokémon")).toBe("pokemon");
  });

  it("keeps Arabic letters rather than collapsing them", () => {
    expect(toSlug("ببجي موبايل")).toBe("ببجي-موبايل");
    expect(toSlug("شحن")).not.toBe("");
  });

  it("falls back to the provider id when a name has no usable characters", () => {
    expect(toOfferSlug({ id: 7, name: "!!!", amount: 1 })).toBe("item-7");
  });

  it("prefers the provider code for a game slug", () => {
    expect(toGameSlug({ code: "pubg_mobile", name: "PUBG Mobile" })).toBe("pubg-mobile");
  });
});

describe("retail pricing", () => {
  it("applies the markup and rounds up to the cent", () => {
    expect(toRetailPrice({ supplierCostUsd: 0.88, markupPercent: 15 })).toBe(1.02);
    expect(toRetailPrice({ supplierCostUsd: 1.75, markupPercent: 20 })).toBe(2.1);
  });

  it("never prices below the supplier cost", () => {
    expect(toRetailPrice({ supplierCostUsd: 2.5, markupPercent: 0 })).toBe(2.5);
    expect(toRetailPrice({ supplierCostUsd: 2.555, markupPercent: 0 })).toBe(2.56);
  });

  it("clamps an out-of-range markup instead of trusting it", () => {
    expect(toRetailPrice({ supplierCostUsd: 1, markupPercent: -50 })).toBe(1);
    expect(toRetailPrice({ supplierCostUsd: 1, markupPercent: 100_000 })).toBe(6);
  });

  it("keeps a zero cost at zero", () => {
    expect(toRetailPrice({ supplierCostUsd: 0, markupPercent: 15 })).toBe(0);
  });
});

describe("account field mapping", () => {
  const fields = { code: "200", info: { fields: ["userid", "serverid"], notes: "Note" } };

  it("maps known provider keys to typed, bilingual fields", () => {
    const mapped = mapInputFields(fields, {
      code: "200",
      servers: { "SouthEast Asia": "SouthEast Asia", America: "America" },
    });

    expect(mapped).toHaveLength(2);
    expect(mapped[0]).toMatchObject({ fieldKey: "userid", fieldType: "uid", isRequired: true });
    expect(mapped[0].labelAr).not.toBe(mapped[0].labelEn);
    expect(mapped[1]).toMatchObject({ fieldKey: "serverid", fieldType: "server" });
    expect(mapped[1].options).toEqual([
      { value: "SouthEast Asia", label_ar: "SouthEast Asia", label_en: "SouthEast Asia" },
      { value: "America", label_ar: "America", label_en: "America" },
    ]);
  });

  it("downgrades a server field with no options to free text", () => {
    const mapped = mapInputFields(fields, null);

    expect(mapped[1]).toMatchObject({ fieldKey: "serverid", fieldType: "text", options: [] });
  });

  it("keeps an unknown key as a required text field rather than dropping it", () => {
    const mapped = mapInputFields({ code: "200", info: { fields: ["wallet_ref"] } }, null);

    expect(mapped[0]).toMatchObject({
      fieldKey: "wallet_ref",
      fieldType: "text",
      isRequired: true,
      labelEn: "Wallet Ref",
    });
  });

  it("ignores blank keys", () => {
    expect(mapInputFields({ code: "200", info: { fields: ["", "  "] } }, null)).toEqual([]);
  });

  it("preserves the provider's field order", () => {
    const mapped = mapInputFields(
      { code: "200", info: { fields: ["charname", "userid"] } },
      null,
    );

    expect(mapped.map((field) => field.fieldKey)).toEqual(["charname", "userid"]);
    expect(mapped.map((field) => field.sortOrder)).toEqual([0, 1]);
  });

  it("detects whether a game needs a server", () => {
    expect(requiresServer(fields)).toBe(true);
    expect(requiresServer({ code: "200", info: { fields: ["userid"] } })).toBe(false);
  });
});
