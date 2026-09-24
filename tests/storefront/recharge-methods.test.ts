import { describe, expect, it } from "vitest";
import {
  BEP20_METHOD_ID,
  BYBIT_METHOD_TEMPLATE,
  normalizeRechargeConfig,
  rechargeMethodsInputSchema,
} from "@/lib/recharge-settings";

describe("storefront recharge method validation", () => {
  it("uses the canonical BEP20 method id for the transfer template", () => {
    expect(BYBIT_METHOD_TEMPLATE.id).toBe(BEP20_METHOD_ID);
    expect(rechargeMethodsInputSchema.safeParse([BYBIT_METHOD_TEMPLATE]).success).toBe(true);
  });

  it("requires a valid receiving address before BEP20 can be enabled", () => {
    expect(rechargeMethodsInputSchema.safeParse([{ ...BYBIT_METHOD_TEMPLATE, enabled: true, account: "not-an-address" }]).success).toBe(false);
    expect(rechargeMethodsInputSchema.safeParse([{ ...BYBIT_METHOD_TEMPLATE, enabled: true, account: `0x${"a".repeat(40)}` }]).success).toBe(true);
  });

  it("rejects legacy on-chain method ids even without an address", () => {
    expect(rechargeMethodsInputSchema.safeParse([{ ...BYBIT_METHOD_TEMPLATE, id: "bybit", enabled: true, account: "" }]).success).toBe(false);
    expect(rechargeMethodsInputSchema.safeParse([{ ...BYBIT_METHOD_TEMPLATE, id: "bybit", enabled: true, account: `0x${"a".repeat(40)}` }]).success).toBe(false);
  });

  it("rejects method ids that differ only by case", () => {
    expect(rechargeMethodsInputSchema.safeParse([
      { ...BYBIT_METHOD_TEMPLATE, id: BEP20_METHOD_ID },
      { ...BYBIT_METHOD_TEMPLATE, id: BEP20_METHOD_ID.toLowerCase() },
    ]).success).toBe(false);
  });

  it("removes a malformed enabled BEP20 row from customer configuration", () => {
    const config = normalizeRechargeConfig({
      methods: [
        { ...BYBIT_METHOD_TEMPLATE, enabled: true, account: "0x123" },
        { ...BYBIT_METHOD_TEMPLATE, id: "bank", enabled: true, account: "BANK-1" },
      ],
    });

    expect(config.methods).toHaveLength(1);
    expect(config.methods[0].id).toBe("bank");
  });
});
