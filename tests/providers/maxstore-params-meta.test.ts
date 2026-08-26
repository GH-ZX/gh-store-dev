import { describe, expect, it } from "vitest";
import { readProductParamsMeta, readProductParams } from "@/providers/maxstore/mapping";

describe("readProductParamsMeta", () => {
  it("returns empty for non-array input", () => {
    expect(readProductParamsMeta(null)).toEqual([]);
    expect(readProductParamsMeta(undefined)).toEqual([]);
    expect(readProductParamsMeta("bad")).toEqual([]);
  });

  it("returns empty for entries without a usable key", () => {
    const result = readProductParamsMeta([{ type: "text" }, { name: "" }]);
    expect(result).toEqual([]);
  });

  it("reads key from key, name, or field_key", () => {
    const result = readProductParamsMeta([
      { key: "a", type: "text" },
      { name: "b", type: "number" },
      { field_key: "c", type: "email" },
    ]);
    expect(result.map((r) => r.field_key)).toEqual(["a", "b", "c"]);
  });

  it("defaults field_type to text for unknown types", () => {
    const result = readProductParamsMeta([{ key: "x", type: "bogus" }]);
    expect(result[0].field_type).toBe("text");
  });

  it("passes through known field types", () => {
    const types = ["text", "number", "email", "select", "password", "tel", "textarea"];
    const input = types.map((t, i) => ({ key: `f${i}`, type: t }));
    const result = readProductParamsMeta(input);
    for (let i = 0; i < types.length; i++) {
      expect(result[i].field_type).toBe(types[i]);
    }
  });

  it("reads label from label_ar, label, or name", () => {
    const result = readProductParamsMeta([
      { key: "a", label_ar: "عربي", label_en: "English" },
      { key: "b", label: "Generic" },
      { key: "c", name: "Name" },
    ]);
    expect(result[0].label_ar).toBe("عربي");
    expect(result[0].label_en).toBe("English");
    expect(result[1].label_ar).toBe("Generic");
    expect(result[2].label_ar).toBe("Name");
  });

  it("defaults is_required to true", () => {
    const result = readProductParamsMeta([{ key: "x" }]);
    expect(result[0].is_required).toBe(true);
  });

  it("respects required: false", () => {
    const result = readProductParamsMeta([{ key: "x", required: false }]);
    expect(result[0].is_required).toBe(false);
  });

  it("passes through options array", () => {
    const result = readProductParamsMeta([
      { key: "server", type: "select", options: ["EU", "NA"] },
    ]);
    expect(result[0].options).toEqual(["EU", "NA"]);
  });

  it("returns empty options for non-array", () => {
    const result = readProductParamsMeta([{ key: "x", options: "bad" }]);
    expect(result[0].options).toEqual([]);
  });

  it("skips entries that are null, non-objects, or arrays", () => {
    const result = readProductParamsMeta([null, "string", [1, 2], { key: "valid" }]);
    expect(result).toHaveLength(1);
    expect(result[0].field_key).toBe("valid");
  });
});

describe("readProductParams", () => {
  it("reads Arabic string params", () => {
    const result = readProductParams(["معرّف اللاعب", "الخادم"]);
    expect(result).toEqual(["معرّف اللاعب", "الخادم"]);
  });

  it("returns empty for non-arrays", () => {
    expect(readProductParams(null)).toEqual([]);
    expect(readProductParams("bad")).toEqual([]);
  });
});
