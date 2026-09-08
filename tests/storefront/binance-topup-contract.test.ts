import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createOrder: vi.fn(), from: vi.fn(), request: vi.fn() }));
vi.mock("@server/lib/auth/guards", () => ({ requireUserId: async () => ({ id: "customer-1" }) }));
vi.mock("@server/lib/logging/logger", () => ({ log: { warn: vi.fn(), error: vi.fn() }, logOutcome: vi.fn() }));
vi.mock("@server/lib/settings/binance-settings", () => ({
  readBinanceCredentials: () => ({ enabled: true, apiKey: "test-key", apiSecret: "test-secret", currency: "USDT" }),
}));
vi.mock("@server/runtime-env", () => ({ runtimeVar: (name: string) => name === "APP_URL" ? "https://gh-store.me" : undefined }));
vi.mock("@server/lib/supabase/service", () => ({
  createSupabaseServiceClient: () => ({ from: mocks.from }), hasServiceRoleKey: () => true,
}));
vi.mock("@server/providers/binance/client", () => ({
  BinanceClient: class { createOrder = mocks.createOrder; },
  BinanceError: class extends Error {}, isBinancePaid: vi.fn(),
}));

import { startBinanceTopUp } from "@server/lib/services/binance-recharge.service";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createOrder.mockResolvedValue({ prepayId: "prepay-1", checkoutUrl: "https://pay.binance.com/test", expireTime: null });
  mocks.request.mockReturnValue({ maybeSingle: async () => ({ data: { request_id: "123e4567-e89b-12d3-a456-426614174000", reference: "RC-TEST" }, error: null }) });
  mocks.from.mockImplementation((table: string) => {
    const query = { select: vi.fn(), eq: vi.fn(), insert: vi.fn(), maybeSingle: async () => ({ data: table === "store_settings" ? { providers: {} } : { id: "invoice-1" }, error: null }) };
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.insert.mockReturnValue(query);
    return query;
  });
});

describe("Binance top-up provider contract", () => {
  it.each([
    ["/en/checkout/product/offer", "en"],
    [`/en/checkout/${"a".repeat(160)}/${"b".repeat(160)}`, "en"],
    [`/ar/checkout/${"منتج".repeat(30)}/${"عرض".repeat(30)}`, "ar"],
    ["https://evil.example", "en"],
  ] as const)("sends valid callback URLs and unchanged money fields for %s", async (returnTo, locale) => {
    const result = await startBinanceTopUp({ rpc: mocks.request } as never, { amount: 12.25, locale, returnTo });
    expect(result).toEqual({ ok: true, invoiceId: "invoice-1", checkoutUrl: "https://pay.binance.com/test" });
    const input = mocks.createOrder.mock.calls[0][0];
    expect(input).toMatchObject({ amount: 12.25, currency: "USDT", rechargeRequestId: "123e4567-e89b-12d3-a456-426614174000" });
    for (const value of [input.returnUrl, input.cancelUrl]) {
      const url = new URL(value);
      expect(url.origin).toBe("https://gh-store.me");
      expect(url.href.length).toBeLessThanOrEqual(256);
      expect(url.searchParams.size).toBeLessThanOrEqual(1);
      expect(url.pathname.startsWith(`/${locale}/recharge`)).toBe(true);
    }
    expect(mocks.request).toHaveBeenCalledExactlyOnceWith("submit_recharge_request", { p_amount: 12.25, p_method: "binance", p_currency: "USD" });
  });
});
