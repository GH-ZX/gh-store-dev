import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userId: vi.fn(),
  summary: vi.fn(),
  client: {},
  deleteCoupon: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/cloudflare-context", () => ({
  getCloudflareContext: () => ({ env: {} }),
}));

vi.mock("@server/session", () => ({
  createSessionClient: () => ({
    supabase: mocks.client,
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

vi.mock("@server/lib/services/session.service", () => ({
  getSessionSummary: mocks.summary,
}));

vi.mock("@server/lib/services/coupon.service", () => ({
  listCoupons: vi.fn().mockResolvedValue([]),
  createCoupon: vi.fn().mockResolvedValue({ ok: true, id: "new-coupon-id" }),
  setCouponActive: vi.fn().mockResolvedValue(true),
  deleteCoupon: mocks.deleteCoupon,
}));

import { DASHBOARD_NAV_GROUPS } from "../../storefront/app/lib/admin-dashboard/navigation";
import { loader, action } from "../../storefront/app/routes/dashboard-coupons";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("admin coupons dashboard navigation", () => {
  it("includes coupons in sales navigation group", () => {
    const salesGroup = DASHBOARD_NAV_GROUPS.find((group) => group.key === "sales");
    expect(salesGroup).toBeDefined();
    const couponItem = salesGroup?.items.find((item) => item.key === "coupons");
    expect(couponItem).toBeDefined();
    expect(couponItem?.href).toBe("/coupons");
  });

  it("redirects unauthenticated loader request to login", async () => {
    mocks.userId.mockResolvedValue(null);
    const request = new Request("https://store.example/en/dashboard/coupons");
    const result = (await loader({
      params: { locale: "en" },
      request,
      context: {},
    } as any)) as Response;

    expect(result.status).toBe(302);
    expect(result.headers.get("Location")).toContain("/en/login");
  });

  it("rejects unauthenticated action request with 401", async () => {
    mocks.userId.mockResolvedValue(null);
    const formData = new FormData();
    formData.append("intent", "create");
    const request = new Request("https://store.example/en/dashboard/coupons", {
      method: "POST",
      body: formData,
    });

    const result = (await action({
      params: { locale: "en" },
      request,
      context: {},
    } as any)) as any;

    expect(result.init?.status ?? result.status).toBe(401);
  });

  it("loads coupons for an authenticated administrator", async () => {
    mocks.userId.mockResolvedValue("admin-1");
    mocks.summary.mockResolvedValue({ isAdmin: true });

    const request = new Request("https://store.example/en/dashboard/coupons");
    const result = (await loader({
      params: { locale: "en" },
      request,
      context: {},
    } as any)) as any;

    expect(result.data.coupons).toEqual([]);
    expect(result.data.locale).toBe("en");
  });

  it("deletes a coupon via action intent=delete", async () => {
    mocks.userId.mockResolvedValue("admin-1");
    mocks.summary.mockResolvedValue({ isAdmin: true });

    const formData = new FormData();
    formData.append("intent", "delete");
    formData.append("id", "coupon-xyz");
    const request = new Request("https://store.example/en/dashboard/coupons", {
      method: "POST",
      body: formData,
    });

    const result = (await action({
      params: { locale: "en" },
      request,
      context: {},
    } as any)) as any;

    expect(mocks.deleteCoupon).toHaveBeenCalledWith(mocks.client, "coupon-xyz");
    expect(result.data.ok).toBe(true);
    expect(result.data.message).toBe("coupon_deleted");
  });
});
