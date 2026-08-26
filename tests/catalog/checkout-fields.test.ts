import { describe, expect, it } from "vitest";
import {
  normalizeOfferInputFields,
  resolveCheckoutFieldKeys,
  resolveQuantityMax,
  type OfferInputFieldDef,
} from "@/lib/catalog/checkout-fields";

describe("normalizeOfferInputFields", () => {
  it("returns an empty array for non-array input", () => {
    expect(normalizeOfferInputFields(null)).toEqual([]);
    expect(normalizeOfferInputFields(undefined)).toEqual([]);
    expect(normalizeOfferInputFields("bad")).toEqual([]);
    expect(normalizeOfferInputFields({})).toEqual([]);
  });

  it("drops entries without a field_key", () => {
    const result = normalizeOfferInputFields([{ field_type: "text" }, {}]);
    expect(result).toEqual([]);
  });

  it("defaults field_type to text when missing or unknown", () => {
    const result = normalizeOfferInputFields([{ field_key: "uid" }, { field_key: "x", field_type: "bogus" }]);
    expect(result).toEqual([
      expect.objectContaining({ field_key: "uid", field_type: "text" }),
      expect.objectContaining({ field_key: "x", field_type: "text" }),
    ]);
  });

  it("passes through all known field types", () => {
    const types = ["text", "number", "email", "uid", "server", "charname", "select"];
    const input = types.map((t) => ({ field_key: t, field_type: t }));
    const result = normalizeOfferInputFields(input);
    expect(result).toHaveLength(types.length);
    for (let i = 0; i < types.length; i++) {
      expect(result[i].field_type).toBe(types[i]);
    }
  });

  it("trims blank field_key and drops entries that become empty", () => {
    const result = normalizeOfferInputFields([{ field_key: "  " }]);
    expect(result).toEqual([]);
  });

  it("preserves options only when they are arrays", () => {
    const result = normalizeOfferInputFields([
      { field_key: "server", options: ["EU", "NA"] },
      { field_key: "other", options: "not-array" },
    ]);
    expect(result[0].options).toEqual(["EU", "NA"]);
    expect(result[1].options).toEqual([]);
  });

  it("defaults is_required to true", () => {
    const result = normalizeOfferInputFields([{ field_key: "x" }]);
    expect(result[0].is_required).toBe(true);
  });

  it("sets is_required to false when explicitly false", () => {
    const result = normalizeOfferInputFields([{ field_key: "x", is_required: false }]);
    expect(result[0].is_required).toBe(false);
  });

  it("returns typed output satisfying OfferInputFieldDef", () => {
    const result: OfferInputFieldDef[] = normalizeOfferInputFields([
      { field_key: "player_id", field_type: "uid", label_ar: "معرّف اللاعب", label_en: "Player ID", is_required: true },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].field_key).toBe("player_id");
    expect(result[0].field_type).toBe("uid");
    expect(result[0].label_ar).toBe("معرّف اللاعب");
  });
});

describe("resolveCheckoutFieldKeys", () => {
  it("returns none for direct delivery", () => {
    const result = resolveCheckoutFieldKeys(
      { deliveryKind: "direct", offerFields: [] },
      { gameFieldKeys: ["uid"] },
    );
    expect(result.kind).toBe("none");
    expect(result.keys.size).toBe(0);
  });

  it("uses offer fields when they exist", () => {
    const result = resolveCheckoutFieldKeys(
      {
        deliveryKind: "account",
        offerFields: [
          { field_key: "email", field_type: "email", is_required: true },
          { field_key: "server", field_type: "select", is_required: true },
        ],
      },
      { gameFieldKeys: ["uid"] },
    );
    expect(result.kind).toBe("offer");
    expect(result.keys).toEqual(new Set(["email", "server"]));
  });

  it("falls back to game fields when offer has no fields", () => {
    const result = resolveCheckoutFieldKeys(
      { deliveryKind: "account", offerFields: [] },
      { gameFieldKeys: ["uid", "charname"] },
    );
    expect(result.kind).toBe("game");
    expect(result.keys).toEqual(new Set(["uid", "charname"]));
  });
});

describe("resolveQuantityMax", () => {
  it("returns 1 for account delivery", () => {
    expect(resolveQuantityMax({ deliveryKind: "account", providerMax: 10 })).toBe(1);
    expect(resolveQuantityMax({ deliveryKind: "account", providerMax: null })).toBe(1);
  });

  it("uses provider max for direct delivery", () => {
    expect(resolveQuantityMax({ deliveryKind: "direct", providerMax: 5 })).toBe(5);
  });

  it("caps at 10", () => {
    expect(resolveQuantityMax({ deliveryKind: "direct", providerMax: 999 })).toBe(10);
  });

  it("defaults to 10 when provider max is null", () => {
    expect(resolveQuantityMax({ deliveryKind: "direct", providerMax: null })).toBe(10);
  });

  it("floors fractional provider max", () => {
    expect(resolveQuantityMax({ deliveryKind: "direct", providerMax: 3.7 })).toBe(3);
  });

  it("floors at 1 for zero or negative provider max", () => {
    expect(resolveQuantityMax({ deliveryKind: "direct", providerMax: 0 })).toBe(1);
    expect(resolveQuantityMax({ deliveryKind: "direct", providerMax: -5 })).toBe(1);
  });
});
