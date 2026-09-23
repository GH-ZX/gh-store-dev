import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn(), from: vi.fn(), rpc: vi.fn() }));
vi.mock("@server/lib/settings/binance-settings", () => ({ readBinanceCredentials: () => ({ apiKey: "test", apiSecret: "test", enabled: true, currency: "USDT" }) }));
vi.mock("@server/lib/supabase/service", () => ({ createSupabaseServiceClient: () => ({ from: mocks.from, rpc: mocks.rpc }), hasServiceRoleKey: () => true }));
vi.mock("@server/providers/binance/client", () => ({ BinanceClient: class { queryOrder = mocks.query; }, BinanceError: class extends Error {}, isBinancePaid: (status: string) => status === "PAID" }));
vi.mock("@server/lib/logging/logger", () => ({ log: { warn: vi.fn() }, logOutcome: vi.fn() }));
import { syncBinanceInvoice as interactive } from "@server/lib/services/binance-recharge.service";
import { syncBinanceInvoice as cron } from "@server/lib/services/binance-sync.service";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.from.mockImplementation((table: string) => {
    const q = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: table === "store_settings" ? { providers: {} } : { status: "pending", recharge_request_id: "request", charge_currency: "USDT", merchant_trade_no: "merchant" } }) };
    return q;
  });
  mocks.rpc.mockResolvedValue({ error: null });
});
for (const [name, run] of [["interactive", () => interactive("merchant")], ["cron", () => cron({ from: mocks.from, rpc: mocks.rpc } as never, "merchant")]] as const) {
  describe(`${name} Binance settlement`, () => {
    it.each([{ merchantTradeNo: "another-order" }, { currency: "BTC" }, { transactionId: null }])("refuses mismatched provider evidence %j", async patch => {
      mocks.query.mockResolvedValue({ status: "PAID", amount: 12, currency: "USDT", merchantTradeNo: "merchant", transactionId: "tx", ...patch });
      expect(await run()).toEqual({ ok: false, reason: "provider" });
      expect(mocks.rpc).not.toHaveBeenCalled();
    });
    it("passes the received amount to atomic credit only after evidence matches", async () => {
      mocks.query.mockResolvedValue({ status: "PAID", amount: 4, currency: "USDT", merchantTradeNo: "merchant", transactionId: "tx" });
      expect(await run()).toEqual({ ok: true, status: "credited", credited: true });
      expect(mocks.rpc).toHaveBeenCalledWith("credit_binance_invoice", expect.objectContaining({ p_paid_amount: 4, p_transaction_id: "tx", p_merchant_trade_no: "merchant" }));
    });
  });
}
