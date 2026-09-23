import { afterEach, describe, expect, it, vi } from "vitest";
import { BinanceClient } from "@server/providers/binance/client";
vi.mock("@server/lib/logging/logger", () => ({ log: { debug: vi.fn() }, logFailure: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());
describe("Binance query v2 payment evidence", () => {
  it("reads documented orderAmount and binds currency and merchant order", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ status: "SUCCESS", code: "000000", data: {
      status: "PAID", orderAmount: "12.25", amount: "9999", currency: "USDT", merchantTradeNo: "merchant-1", transactionId: "tx-1",
    } })));
    expect(await new BinanceClient({ apiKey: "test", secret: "test" }).queryOrder("request-1")).toEqual({ status: "PAID", amount: 12.25, currency: "USDT", merchantTradeNo: "merchant-1", transactionId: "tx-1" });
  });
  it.each(["", "Infinity", "not-a-number", undefined])("never substitutes billed amount for missing/invalid orderAmount %s", async orderAmount => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ status: "SUCCESS", code: "000000", data: { status: "PAID", amount: "15", orderAmount } })));
    const result = await new BinanceClient({ apiKey: "test", secret: "test" }).queryOrder("request-1");
    expect(result.amount).toBeNull();
    expect(result.currency).toBeNull();
    expect(result.merchantTradeNo).toBeNull();
  });
});
