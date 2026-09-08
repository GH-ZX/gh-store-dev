import { beforeEach, describe, expect, it } from "vitest";
import {
  TIERS,
  buildRateLimitResponse,
  checkRateLimit,
  getClientIp,
  rateLimitStore,
  resolveRateLimitTier,
} from "../../storefront/workers/rate-limiter";

describe("edge rate limiter", () => {
  beforeEach(() => {
    rateLimitStore.clear();
  });

  describe("client IP extraction", () => {
    it("prefers cf-connecting-ip when present", () => {
      const request = new Request("https://gh-store.me/ar", {
        headers: {
          "cf-connecting-ip": "203.0.113.195",
          "x-real-ip": "198.51.100.1",
          "x-forwarded-for": "192.0.2.1, 10.0.0.1",
        },
      });
      expect(getClientIp(request)).toBe("203.0.113.195");
    });

    it("falls back to x-real-ip if cf-connecting-ip is missing", () => {
      const request = new Request("https://gh-store.me/ar", {
        headers: {
          "x-real-ip": "198.51.100.1",
          "x-forwarded-for": "192.0.2.1",
        },
      });
      expect(getClientIp(request)).toBe("198.51.100.1");
    });

    it("falls back to the first client IP in x-forwarded-for", () => {
      const request = new Request("https://gh-store.me/ar", {
        headers: {
          "x-forwarded-for": "192.0.2.42, 10.0.0.1, 172.16.0.1",
        },
      });
      expect(getClientIp(request)).toBe("192.0.2.42");
    });

    it("falls back to 127.0.0.1 if no headers are provided", () => {
      const request = new Request("https://gh-store.me/ar");
      expect(getClientIp(request)).toBe("127.0.0.1");
    });
  });

  describe("tier classification", () => {
    it("classifies POST checkout requests under CHECKOUT tier", () => {
      const request = new Request("https://gh-store.me/ar/checkout/pubg/60-uc", {
        method: "POST",
      });
      expect(resolveRateLimitTier(request)).toEqual(TIERS.CHECKOUT);
    });

    it("classifies POST authentication requests under AUTH tier", () => {
      const login = new Request("https://gh-store.me/ar/login", { method: "POST" });
      const forgot = new Request("https://gh-store.me/en/forgot-password", { method: "POST" });
      const reset = new Request("https://gh-store.me/ar/reset-password", { method: "POST" });

      expect(resolveRateLimitTier(login)).toEqual(TIERS.AUTH);
      expect(resolveRateLimitTier(forgot)).toEqual(TIERS.AUTH);
      expect(resolveRateLimitTier(reset)).toEqual(TIERS.AUTH);
    });

    it("classifies POST recharge requests under RECHARGE tier", () => {
      const request = new Request("https://gh-store.me/ar/recharge", { method: "POST" });
      expect(resolveRateLimitTier(request)).toEqual(TIERS.RECHARGE);
    });

    it("classifies GET search suggest requests under SEARCH tier", () => {
      const request = new Request("https://gh-store.me/api/search/suggest?q=steam");
      expect(resolveRateLimitTier(request)).toEqual(TIERS.SEARCH);
    });

    it("defaults general traffic to GLOBAL tier", () => {
      const home = new Request("https://gh-store.me/ar");
      const catalog = new Request("https://gh-store.me/en/products");
      expect(resolveRateLimitTier(home)).toEqual(TIERS.GLOBAL);
      expect(resolveRateLimitTier(catalog)).toEqual(TIERS.GLOBAL);
    });
  });

  describe("sliding window enforcement", () => {
    it("allows requests below the limit and decreases remaining count", () => {
      const baseTime = 1_700_000_000_000;
      const request = new Request("https://gh-store.me/ar/checkout/test/item", {
        method: "POST",
        headers: { "cf-connecting-ip": "1.2.3.4" },
      });

      const first = checkRateLimit(request, baseTime);
      expect(first.allowed).toBe(true);
      expect(first.limit).toBe(TIERS.CHECKOUT.limit);
      expect(first.remaining).toBe(TIERS.CHECKOUT.limit - 1);

      const second = checkRateLimit(request, baseTime + 1000);
      expect(second.allowed).toBe(true);
      expect(second.remaining).toBe(TIERS.CHECKOUT.limit - 2);
    });

    it("blocks requests once the tier limit is reached", () => {
      const baseTime = 1_700_000_000_000;
      const request = new Request("https://gh-store.me/ar/checkout/test/item", {
        method: "POST",
        headers: { "cf-connecting-ip": "1.2.3.4" },
      });

      // Exhaust limit
      for (let i = 0; i < TIERS.CHECKOUT.limit; i++) {
        const res = checkRateLimit(request, baseTime + i * 100);
        expect(res.allowed).toBe(true);
      }

      // Exceeded
      const blocked = checkRateLimit(request, baseTime + 2000);
      expect(blocked.allowed).toBe(false);
      expect(blocked.remaining).toBe(0);
      expect(blocked.resetSeconds).toBeGreaterThan(0);
    });

    it("isolates limits across different client IPs", () => {
      const baseTime = 1_700_000_000_000;
      const clientA = new Request("https://gh-store.me/ar/checkout/test/item", {
        method: "POST",
        headers: { "cf-connecting-ip": "10.0.0.1" },
      });
      const clientB = new Request("https://gh-store.me/ar/checkout/test/item", {
        method: "POST",
        headers: { "cf-connecting-ip": "10.0.0.2" },
      });

      // Exhaust client A
      for (let i = 0; i < TIERS.CHECKOUT.limit; i++) {
        checkRateLimit(clientA, baseTime + i * 50);
      }
      expect(checkRateLimit(clientA, baseTime + 1000).allowed).toBe(false);

      // Client B is unaffected
      const resultB = checkRateLimit(clientB, baseTime + 1000);
      expect(resultB.allowed).toBe(true);
      expect(resultB.remaining).toBe(TIERS.CHECKOUT.limit - 1);
    });

    it("resets allowance when sliding window expires", () => {
      const baseTime = 1_700_000_000_000;
      const request = new Request("https://gh-store.me/ar/checkout/test/item", {
        method: "POST",
        headers: { "cf-connecting-ip": "1.2.3.4" },
      });

      // Exhaust limit
      for (let i = 0; i < TIERS.CHECKOUT.limit; i++) {
        checkRateLimit(request, baseTime + i * 50);
      }
      expect(checkRateLimit(request, baseTime + 1000).allowed).toBe(false);

      // Jump 125 seconds into the future (past 2 full 60s windows)
      const afterWindow = checkRateLimit(request, baseTime + 125_000);
      expect(afterWindow.allowed).toBe(true);
      expect(afterWindow.remaining).toBe(TIERS.CHECKOUT.limit - 1);
    });
  });

  describe("response builder", () => {
    it("returns an HTTP 429 JSON response with standard rate limit headers for API requests", async () => {
      const request = new Request("https://gh-store.me/api/search/suggest?q=test", {
        headers: { accept: "application/json" },
      });

      const response = buildRateLimitResponse(request, {
        allowed: false,
        limit: 60,
        remaining: 0,
        resetSeconds: 45,
        tier: "search",
      });

      expect(response.status).toBe(429);
      expect(response.headers.get("Retry-After")).toBe("45");
      expect(response.headers.get("X-RateLimit-Limit")).toBe("60");
      expect(response.headers.get("X-RateLimit-Remaining")).toBe("0");
      expect(response.headers.get("X-RateLimit-Tier")).toBe("search");
      expect(response.headers.get("Content-Type")).toContain("application/json");

      const body = await response.json();
      expect(body).toEqual({
        error: "too_many_requests",
        message: "Rate limit exceeded. Please retry after 45 seconds.",
        retryAfterSeconds: 45,
        tier: "search",
      });
    });

    it("returns an HTTP 429 HTML response for browser document requests", async () => {
      const request = new Request("https://gh-store.me/ar/checkout/pubg/item", {
        headers: { accept: "text/html,application/xhtml+xml" },
      });

      const response = buildRateLimitResponse(request, {
        allowed: false,
        limit: 12,
        remaining: 0,
        resetSeconds: 30,
        tier: "checkout",
      });

      expect(response.status).toBe(429);
      expect(response.headers.get("Retry-After")).toBe("30");
      expect(response.headers.get("Content-Type")).toContain("text/html");

      const html = await response.text();
      expect(html).toContain("تم تجاوز حد الطلبات");
      expect(html).toContain("30s");
    });
  });
});
