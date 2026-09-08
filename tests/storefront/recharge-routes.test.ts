import { beforeEach, describe, expect, it, vi } from "vitest";
import { binanceReturnUrl, checkoutReturnTo } from "../../storefront/app/.server/recharge-flow";
import { rechargeAmount, rechargeHref } from "../../storefront/app/lib/recharge-flow";

const mocks = vi.hoisted(() => ({
  userId: vi.fn(), summary: vi.fn(), config: vi.fn(), requests: vi.fn(),
  submit: vi.fn(), samOptions: vi.fn(), binanceOptions: vi.fn(),
  startSam: vi.fn(), startBinance: vi.fn(), detail: vi.fn(), wallet: vi.fn(),
  paymentInvoice: vi.fn(), markPaid: vi.fn(), samInvoice: vi.fn(), binanceInvoice: vi.fn(),
  client: {},
}));

vi.mock("@/lib/cloudflare-context", () => ({ getCloudflareContext: () => ({ env: {} }) }));
vi.mock("@server/session", () => ({
  createSessionClient: () => ({ supabase: mocks.client, jar: { cookies: [] }, isProduction: false }),
  getSessionUserId: mocks.userId,
  sessionCookieHeaders: () => [["Set-Cookie", "session=refreshed; Path=/; HttpOnly"]],
  withSessionCookies: (response: Response) => response,
  redirectToLogin: (_request: Request, locale: string, next: string) => new Response(null, {
    status: 302, headers: { Location: `/${locale}/login?next=${encodeURIComponent(next)}` },
  }),
}));
vi.mock("@server/lib/services/session.service", () => ({ getSessionSummary: mocks.summary }));
vi.mock("@server/lib/services/recharge.service", () => ({
  getRechargeConfig: mocks.config, getMyRechargeRequests: mocks.requests,
  submitRechargeRequest: mocks.submit, getMyRechargeRequest: mocks.detail,
  getMyRechargePaymentInvoice: mocks.paymentInvoice, markRechargePaid: mocks.markPaid,
}));
vi.mock("@server/lib/services/wallet.service", () => ({ getMyWallet: mocks.wallet }));
vi.mock("@server/lib/services/sam-recharge.service", () => ({
  getSamPaymentOptions: mocks.samOptions, startSamTopUp: mocks.startSam,
  getMySamInvoice: mocks.samInvoice, syncSamInvoice: vi.fn(), verifySamPayment: vi.fn(),
}));
vi.mock("@server/lib/services/binance-recharge.service", () => ({
  getBinancePaymentOptions: mocks.binanceOptions, startBinanceTopUp: mocks.startBinance,
  getMyBinanceInvoice: mocks.binanceInvoice, syncMyBinanceInvoice: vi.fn(),
}));

import { action as rechargeAction, loader as rechargeLoader } from "../../storefront/app/routes/locale-recharge";
import { action as detailAction, loader as detailLoader } from "../../storefront/app/routes/locale-recharge-detail";
import { loader as paymentLoader } from "../../storefront/app/routes/locale-recharge-pay";

const checkout = "/en/checkout/example-product/example-offer";
const requestId = "123e4567-e89b-12d3-a456-426614174000";
const method = { id: "transfer", labelEn: "Bank transfer", labelAr: "تحويل", account: "TRANSFER-ACCOUNT", instructionsEn: "Include the reference.", instructionsAr: "أضف المرجع.", enabled: true };
function args(path: string, form?: Record<string, string>) {
  return {
    request: new Request(`https://store.example${path}`, form ? { method: "POST", body: new URLSearchParams(form) } : {}),
    params: { locale: "en", requestId, invoiceId: "sam-existing" }, context: {},
  } as never;
}
function payload(value: unknown) { return (value as { data: Record<string, unknown> }).data; }
function location(value: unknown) { return new URL((value as Response).headers.get("Location")!, "https://store.example"); }

beforeEach(() => {
  vi.clearAllMocks();
  mocks.userId.mockResolvedValue("customer-1");
  mocks.summary.mockResolvedValue({ isAdmin: false });
  mocks.config.mockResolvedValue({ minAmount: 5, maxAmount: 100, currency: "USD", methods: [method] });
  mocks.requests.mockResolvedValue([]);
  mocks.samOptions.mockResolvedValue({ enabled: false, methods: [] });
  mocks.binanceOptions.mockResolvedValue({ enabled: false, currency: "USDT" });
  mocks.detail.mockResolvedValue({ id: requestId, status: "pending", paymentMethod: "transfer" });
  mocks.wallet.mockResolvedValue({ balance: 0, currency: "USD" });
  mocks.paymentInvoice.mockResolvedValue(null);
  mocks.markPaid.mockResolvedValue(true);
  mocks.samInvoice.mockResolvedValue({ samInvoiceId: "sam-existing", status: "pending" });
});

describe("checkout recharge context", () => {
  it("preserves amount and checkout through method selection and back navigation", () => {
    const methodUrl = new URL(rechargeHref("/en/recharge", { amount: 12.25, returnTo: checkout, method: "manual:transfer" }), "https://store.example");
    expect(methodUrl.searchParams.get("amount")).toBe("12.25");
    expect(methodUrl.searchParams.get("returnTo")).toBe(checkout);
    expect(methodUrl.searchParams.get("method")).toBe("manual:transfer");
    expect(rechargeHref("/en/recharge")).toBe("/en/recharge");
  });
  it("prefills the requested shortfall within the store's allowed limits", async () => {
    const result = await rechargeLoader(args(rechargeHref("/en/recharge", { amount: 2, returnTo: checkout, method: "manual:transfer" })));
    expect(payload(result)).toMatchObject({ initialAmount: 5, returnTo: checkout, chosen: "manual:transfer" });
    expect(rechargeAmount("200", 5, 100)).toBe(100);
    expect(rechargeAmount("1.1", 1, 100)).toBe(1.1);
    expect(rechargeAmount("1.005", 1, 100)).toBe(1.01);
  });
  it.each(["", "NaN", "Infinity", "-5", "0", "not-an-amount"])("does not prefill unusable amount %s", (value) => {
    expect(rechargeAmount(value, 5, 100)).toBeNull();
  });
  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "/en/profile", "/ar/checkout/a/b", "/en/checkout/a/%2Foutside", "/en/checkout/a/%5Coutside", "/en/checkout/a/%", "/en/checkout/../profile"])("rejects unrelated or unsafe checkout return %s", (value) => {
    expect(checkoutReturnTo(value, "en")).toBeNull();
  });
  it("keeps a valid checkout path and drops unrelated query data", () => {
    expect(checkoutReturnTo(`${checkout}?source=mail#payment`, "en")).toBe(checkout);
  });
  it("preserves the full recharge destination when authentication expires", async () => {
    mocks.userId.mockResolvedValue(null);
    const path = rechargeHref("/en/recharge", { amount: 12.25, returnTo: checkout, method: "manual:transfer" });
    expect(location(await rechargeLoader(args(path))).searchParams.get("next")).toBe(path);
    expect(mocks.config).not.toHaveBeenCalled();
  });
  it.each([
    ["submitRechargeAction", "transfer", "manual"],
    ["startSamTopUpAction", "shamcash", "sam"],
    ["startBinanceTopUpAction", "", "binance"],
  ])("retains checkout after %s without altering the requested amount", async (intent, selectedMethod, kind) => {
    mocks.submit.mockResolvedValue({ ok: true, requestId });
    mocks.startSam.mockResolvedValue({ ok: true, invoice: { samInvoiceId: "sam-new" } });
    mocks.startBinance.mockResolvedValue({ ok: true, invoiceId: "binance-new" });
    const response = await rechargeAction(args("/en/recharge", { intent, method: selectedMethod, amount: "12.25", returnTo: checkout }));
    expect(location(response).searchParams.get("returnTo")).toBe(checkout);
    expect(location(response).pathname).toBe(kind === "manual" ? `/en/recharge/${requestId}` : `/en/recharge/pay/${kind}-new`);
    const service = kind === "manual" ? mocks.submit : kind === "sam" ? mocks.startSam : mocks.startBinance;
    expect(service).toHaveBeenCalledWith(mocks.client, expect.objectContaining({ amount: 12.25 }));
  });
  it("does not forward an external return destination to payment services", async () => {
    mocks.startBinance.mockResolvedValue({ ok: true, invoiceId: "binance-new" });
    const response = await rechargeAction(args("/en/recharge", { intent: "startBinanceTopUpAction", amount: "12.25", returnTo: "https://evil.example" }));
    expect(location(response).searchParams.has("returnTo")).toBe(false);
    expect(mocks.startBinance).toHaveBeenCalledWith(mocks.client, { amount: 12.25, locale: "en", returnTo: null });
  });
  it("does not initiate a recharge with an invalid amount", async () => {
    const response = await rechargeAction(args("/en/recharge", { amount: "Infinity", method: "transfer" }));
    expect(payload(response).error).toBe("invalid_input");
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(mocks.startSam).not.toHaveBeenCalled();
    expect(mocks.startBinance).not.toHaveBeenCalled();
  });
});

describe("Binance V3 return URL contract", () => {
  const origin = "https://gh-store.me";
  const paymentPath = "/en/recharge/pay/123e4567e89b12d3a456426614174000";
  it.each([paymentPath, "/en/recharge"])("carries at most one parameter for %s", (path) => {
    const url = new URL(binanceReturnUrl(origin, path, checkout));
    expect([...url.searchParams.keys()]).toEqual(["returnTo"]);
    expect(url.searchParams.get("returnTo")).toBe(checkout);
    expect(url.href.length).toBeLessThanOrEqual(256);
    expect(url.origin).toBe(origin);
  });
  it.each(["a".repeat(160), "منتج".repeat(40)])("falls back to the store payment page for long or encoded slugs", (slug) => {
    const target = checkoutReturnTo(`/en/checkout/${slug}/${slug}`, "en");
    const url = new URL(binanceReturnUrl(origin, paymentPath, target));
    expect(url.href).toBe(`${origin}${paymentPath}`);
    expect(url.searchParams.size).toBe(0);
    expect(url.href.length).toBeLessThanOrEqual(256);
  });
  it("never truncates a checkout into a different or broken route at the limit", () => {
    const base = `${origin}${paymentPath}?returnTo=%2Fen%2Fcheckout%2F`;
    const prefix = "/en/checkout/";
    const slug = "a".repeat(256 - base.length - "%2Fb".length);
    const target = `${prefix}${slug}/b`;
    expect(binanceReturnUrl(origin, paymentPath, target).length).toBe(256);
    expect(binanceReturnUrl(origin, paymentPath, `${target}b`)).toBe(`${origin}${paymentPath}`);
  });
  it.each(["file:///tmp", "not-a-url", `https://${"a".repeat(240)}.example`])("rejects invalid provider URL configuration %s", (siteUrl) => {
    expect(() => binanceReturnUrl(siteUrl, paymentPath, checkout)).toThrow();
  });
});

describe("recharge history and payment confirmation", () => {
  it("retains manual payment instructions after the request is created", async () => {
    const result = await detailLoader(args(rechargeHref(`/en/recharge/${requestId}`, { returnTo: checkout })));
    expect(payload(result)).toMatchObject({ method, returnTo: checkout });
    expect(mocks.paymentInvoice).toHaveBeenCalledWith(mocks.client, "customer-1", requestId);
  });
  it("resumes the existing provider invoice from request history", async () => {
    mocks.paymentInvoice.mockResolvedValue("sam-existing");
    const response = await detailLoader(args(rechargeHref(`/en/recharge/${requestId}`, { returnTo: checkout })));
    expect(location(response).pathname).toBe("/en/recharge/pay/sam-existing");
    expect(location(response).searchParams.get("returnTo")).toBe(checkout);
    expect(mocks.startSam).not.toHaveBeenCalled();
    expect(mocks.startBinance).not.toHaveBeenCalled();
  });
  it("keeps already reviewed requests on their receipt and status page", async () => {
    mocks.detail.mockResolvedValue({ id: requestId, status: "approved", paymentMethod: "transfer" });
    expect(payload(await detailLoader(args(`/en/recharge/${requestId}`))).detail).toMatchObject({ status: "approved" });
    expect(mocks.paymentInvoice).not.toHaveBeenCalled();
  });
  it("provides the safe checkout return destination to the payment screen", async () => {
    const result = await paymentLoader(args(rechargeHref("/en/recharge/pay/sam-existing", { returnTo: checkout })));
    expect(payload(result).returnTo).toBe(checkout);
  });
  it("accepts an explicit paid confirmation through the existing customer RPC only", async () => {
    const response = await detailAction(args(`/en/recharge/${requestId}`, { intent: "markRechargePaid" }));
    expect(payload(response)).toEqual({ error: null });
    expect(mocks.markPaid).toHaveBeenCalledWith(mocks.client, requestId);
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(mocks.startSam).not.toHaveBeenCalled();
  });
  it("does not silently mark a request paid for an unrelated form action", async () => {
    const response = await detailAction(args(`/en/recharge/${requestId}`, { intent: "checkNow" }));
    expect(payload(response).error).toBe("invalid_input");
    expect(mocks.markPaid).not.toHaveBeenCalled();
  });
  it("shows a failed confirmation as an error rather than a false success", async () => {
    mocks.markPaid.mockResolvedValue(false);
    expect(payload(await detailAction(args(`/en/recharge/${requestId}`, { intent: "markRechargePaid" }))).error).toBe("not_found");
  });
});
