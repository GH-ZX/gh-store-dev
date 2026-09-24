import { describe, expect, it } from "vitest";
import {
  BYBIT_METHOD_TEMPLATE,
  normalizeRechargeConfig,
  parseRechargeMethodsInput,
  rechargeMethodsInputSchema,
} from "@/lib/settings/recharge-settings";

describe("rechargeMethodsInputSchema", () => {
  it("accepts a complete method such as the Bybit template", () => {
    expect(rechargeMethodsInputSchema.safeParse([BYBIT_METHOD_TEMPLATE]).success).toBe(true);
  });

  it("requires the id a customer page keys on, and bounds its length", () => {
    expect(
      rechargeMethodsInputSchema.safeParse([{ ...BYBIT_METHOD_TEMPLATE, id: "" }]).success,
    ).toBe(false);
    expect(
      rechargeMethodsInputSchema.safeParse([
        { ...BYBIT_METHOD_TEMPLATE, id: "x".repeat(41) },
      ]).success,
    ).toBe(false);
  });

  it("rejects duplicate ids, so a customer select can never point at two rows at once", () => {
    expect(
      rechargeMethodsInputSchema.safeParse([BYBIT_METHOD_TEMPLATE, BYBIT_METHOD_TEMPLATE]).success,
    ).toBe(false);
  });

  it("bounds how many methods the page can offer", () => {
    const methods = Array.from({ length: 21 }, (_, index) => ({
      ...BYBIT_METHOD_TEMPLATE,
      id: `method-${index}`,
    }));

    expect(rechargeMethodsInputSchema.safeParse(methods).success).toBe(false);
  });

  it("bounds label, account and instruction lengths", () => {
    expect(
      rechargeMethodsInputSchema.safeParse([
        { ...BYBIT_METHOD_TEMPLATE, account: "x".repeat(161) },
      ]).success,
    ).toBe(false);
    expect(
      rechargeMethodsInputSchema.safeParse([
        { ...BYBIT_METHOD_TEMPLATE, instructions_en: "x".repeat(601) },
      ]).success,
    ).toBe(false);
  });

  it("defaults missing label and instruction fields to empty strings", () => {
    const parsed = rechargeMethodsInputSchema.safeParse([{ id: "bank", enabled: true }]);

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data[0]).toMatchObject({ label_en: "", label_ar: "", account: "" });
    }
  });
});

describe("parseRechargeMethodsInput", () => {
  it("parses the JSON the editor submits", () => {
    const result = parseRechargeMethodsInput(JSON.stringify([BYBIT_METHOD_TEMPLATE]));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.methods[0].id).toBe("BEP20");
    }
  });

  it("rejects malformed JSON and non-method structures", () => {
    expect(parseRechargeMethodsInput("not json").ok).toBe(false);
    expect(parseRechargeMethodsInput("[1,2,3]").ok).toBe(false);
    expect(parseRechargeMethodsInput('[{"id":""}]').ok).toBe(false);
  });

  it("round-trips through normalizeRechargeConfig so only enabled methods reach customers", () => {
    const result = parseRechargeMethodsInput(
      JSON.stringify([
        { ...BYBIT_METHOD_TEMPLATE, enabled: true, account: `0x${"a".repeat(40)}` },
        { ...BYBIT_METHOD_TEMPLATE, id: "bank" },
      ]),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const config = normalizeRechargeConfig({ methods: result.methods });
    const [bybit, bank] = config.methods;

    expect(bybit).toMatchObject({ id: "BEP20", enabled: true, account: `0x${"a".repeat(40)}` });
    // A method left disabled is carried but never surfaced.
    expect(bank.enabled).toBe(false);
    expect(config.methods.length).toBe(2);
  });

  it("keeps the Bybit template hidden until the owner enables it", () => {
    const config = normalizeRechargeConfig({ methods: [BYBIT_METHOD_TEMPLATE] });

    expect(config.methods[0].enabled).toBe(false);
    expect(config.methods[0].labelEn).toBe("Bybit (USDT · BEP20)");
    expect(config.methods[0].labelAr).not.toBe(config.methods[0].labelEn);
  });
});