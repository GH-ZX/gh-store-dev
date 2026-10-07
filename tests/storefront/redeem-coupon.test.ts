import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userId: vi.fn(),
  rpc: vi.fn(),
  wallet: { id: "w-1", balance: 25.5, currency: "USD" },
}));

vi.mock("@/lib/cloudflare-context", () => ({
  getCloudflareContext: () => ({ env: {} }),
}));

vi.mock("@server/session", () => ({
  createSessionClient: () => ({
    supabase: {
      rpc: mocks.rpc,
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: mocks.wallet, error: null }),
      }),
    },
    jar: { cookies: [] },
    isProduction: false,
  }),
  getSessionUserId: mocks.userId,
  sessionCookieHeaders: () => [["Set-Cookie", "session=refreshed; Path=/; HttpOnly"]],
  withSessionCookies: (response: Response) => response,
  redirectToLogin: (_request: Request, locale: string, next: string) =>
    new Response(null, {
      status: 302,
      headers: { Location: `/${locale}/login?next=${encodeURIComponent(next)}` },
    }),
}));

vi.mock("@server/lib/services/wallet.service", () => ({
  getMyWallet: vi.fn().mockResolvedValue(mocks.wallet),
}));

import { redeemCouponToWallet } from "../../storefront/app/.server/lib/services/coupon.service";
import { loader, action } from "../../storefront/app/routes/locale-redeem";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("redeem coupon to wallet", () => {
  describe("redeemCouponToWallet service", () => {
    it("rejects empty or short codes immediately", async () => {
      const client = { rpc: mocks.rpc } as any;
      const res = await redeemCouponToWallet(client, "");
      expect(res).toEqual({ ok: false, reason: "invalid_code" });
      expect(mocks.rpc).not.toHaveBeenCalled();
    });

    it("normalizes code to uppercase and calls redeem_coupon_to_wallet RPC", async () => {
      mocks.rpc.mockResolvedValue({
        data: {
          ok: true,
          amount: 10,
          balance_after: 35.5,
          code: "GIFT10",
        },
        error: null,
      });

      const client = { rpc: mocks.rpc } as any;
      const res = await redeemCouponToWallet(client, "gift10");

      expect(mocks.rpc).toHaveBeenCalledWith("redeem_coupon_to_wallet", {
        p_code: "GIFT10",
      });
      expect(res).toEqual({
        ok: true,
        amount: 10,
        balanceAfter: 35.5,
        code: "GIFT10",
      });
    });

    it("returns failure when RPC returns error or ok=false", async () => {
      mocks.rpc.mockResolvedValue({
        data: {
          ok: false,
          error: "exhausted",
        },
        error: null,
      });

      const client = { rpc: mocks.rpc } as any;
      const res = await redeemCouponToWallet(client, "EXHAUSTED10");

      expect(res).toEqual({
        ok: false,
        reason: "exhausted",
      });
    });
  });

  describe("locale-redeem route", () => {
    it("redirects unauthenticated users to login with next=/en/redeem", async () => {
      mocks.userId.mockResolvedValue(null);

      const request = new Request("https://store.example/en/redeem");
      const res = (await loader({
        params: { locale: "en" },
        request,
        context: {},
      } as any)) as Response;

      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toContain("/en/login?next=%2Fen%2Fredeem");
    });

    it("loads current wallet for signed-in user", async () => {
      mocks.userId.mockResolvedValue("user-1");

      const request = new Request("https://store.example/en/redeem");
      const res = (await loader({
        params: { locale: "en" },
        request,
        context: {},
      } as any)) as any;

      expect(res.data.wallet).toEqual(mocks.wallet);
      expect(res.data.locale).toBe("en");
    });

    it("handles redemption action successfully", async () => {
      mocks.userId.mockResolvedValue("user-1");
      mocks.rpc.mockResolvedValue({
        data: {
          ok: true,
          amount: 20,
          balance_after: 45.5,
          code: "VIP20",
        },
        error: null,
      });

      const formData = new FormData();
      formData.append("code", "vip20");

      const request = new Request("https://store.example/en/redeem", {
        method: "POST",
        body: formData,
      });

      const res = (await action({
        params: { locale: "en" },
        request,
        context: {},
      } as any)) as any;

      expect(res.data.ok).toBe(true);
      expect(res.data.amount).toBe(20);
      expect(res.data.balanceAfter).toBe(45.5);
      expect(res.data.code).toBe("VIP20");
    });
  });
});
