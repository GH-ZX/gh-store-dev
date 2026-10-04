import { describe, expect, it, vi } from "vitest";
import {
  CLOUDFLARE_TEST_SECRET_KEY,
  CLOUDFLARE_TEST_SITE_KEY,
  getClientIp,
  getTurnstileConfig,
  verifyTurnstileToken,
} from "../../storefront/app/.server/lib/auth/turnstile";
import { SECURITY_HEADERS } from "../../storefront/workers/response-headers";

describe("Turnstile configuration", () => {
  it("uses provided keys when set in environment", () => {
    const config = getTurnstileConfig({
      TURNSTILE_SITE_KEY: "custom_site_key",
      TURNSTILE_SECRET_KEY: "custom_secret_key",
    } as any);

    expect(config.enabled).toBe(true);
    expect(config.siteKey).toBe("custom_site_key");
    expect(config.secretKey).toBe("custom_secret_key");
  });

  it("handles alternative TURNSTILE_SECRET and TURNSTILE_SITEKEY aliases", () => {
    const config = getTurnstileConfig({
      TURNSTILE_SITEKEY: "site_alias",
      TURNSTILE_SECRET: "secret_alias",
    } as any);

    expect(config.enabled).toBe(true);
    expect(config.siteKey).toBe("site_alias");
    expect(config.secretKey).toBe("secret_alias");
  });

  it("handles camelCase config keys from getStoreEnv", () => {
    const config = getTurnstileConfig({
      turnstileSiteKey: "site_123",
      turnstileSecretKey: "secret_123",
    } as any);

    expect(config.enabled).toBe(true);
    expect(config.siteKey).toBe("site_123");
    expect(config.secretKey).toBe("secret_123");
  });

  it("defaults to Cloudflare test keys in dev mode when unconfigured", () => {
    const config = getTurnstileConfig(undefined, { isDev: true });
    expect(config.enabled).toBe(true);
    expect(config.siteKey).toBe(CLOUDFLARE_TEST_SITE_KEY);
    expect(config.secretKey).toBe(CLOUDFLARE_TEST_SECRET_KEY);
  });

  it("disables Turnstile in production when keys are missing", () => {
    const config = getTurnstileConfig(undefined, { isDev: false });
    expect(config.enabled).toBe(false);
    expect(config.siteKey).toBe("");
    expect(config.secretKey).toBe("");
  });
});

describe("Client IP resolution", () => {
  it("prefers cf-connecting-ip over x-forwarded-for", () => {
    const req = new Request("https://gh-store.me/en/login", {
      headers: {
        "cf-connecting-ip": "198.51.100.4",
        "x-forwarded-for": "203.0.113.195, 10.0.0.1",
      },
    });
    expect(getClientIp(req)).toBe("198.51.100.4");
  });

  it("extracts the first IP from x-forwarded-for if cf-connecting-ip is missing", () => {
    const req = new Request("https://gh-store.me/en/login", {
      headers: {
        "x-forwarded-for": "203.0.113.195, 10.0.0.1",
      },
    });
    expect(getClientIp(req)).toBe("203.0.113.195");
  });

  it("returns empty string if neither header is present", () => {
    const req = new Request("https://gh-store.me/en/login");
    expect(getClientIp(req)).toBe("");
  });
});

describe("Turnstile verification", () => {
  it("fails open gracefully when Turnstile is disabled", async () => {
    const result = await verifyTurnstileToken({
      token: null,
      env: {
        turnstileSiteKey: "",
        turnstileSecretKey: "",
      } as any,
    });
    expect(result).toEqual({ ok: true });
  });

  it("rejects immediately with missing_turnstile_token when token is missing", async () => {
    const result = await verifyTurnstileToken({
      token: "",
      env: {
        TURNSTILE_SITE_KEY: "0x4AAAAAA",
        TURNSTILE_SECRET_KEY: "0x4AAAAAA_secret",
      } as any,
    });

    expect(result).toEqual({
      ok: false,
      reason: "missing_turnstile_token",
    });
  });

  it("rejects token exceeding maximum allowed length of 2048 chars", async () => {
    const oversizedToken = "a".repeat(2049);
    const result = await verifyTurnstileToken({
      token: oversizedToken,
      env: {
        TURNSTILE_SITE_KEY: "site_key",
        TURNSTILE_SECRET_KEY: "secret_key",
      } as any,
    });

    expect(result).toEqual({
      ok: false,
      reason: "missing_turnstile_token",
    });
  });

  it("verifies valid token successfully with Cloudflare siteverify", async () => {
    const mockFetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          action: "login",
          hostname: "gh-store.me",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const result = await verifyTurnstileToken({
      token: "valid_token_xyz",
      expectedAction: "login",
      expectedHostnames: ["gh-store.me"],
      clientIp: "198.51.100.5",
      env: {
        TURNSTILE_SITE_KEY: "site_key",
        TURNSTILE_SECRET_KEY: "secret_key",
      } as any,
      fetcher: mockFetcher,
    });

    expect(result).toEqual({ ok: true });
    expect(mockFetcher).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetcher.mock.calls[0];
    expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      "Content-Type": "application/x-www-form-urlencoded",
    });
  });

  it("rejects when outcome action does not match expected action", async () => {
    const mockFetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          action: "signup",
          hostname: "gh-store.me",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const result = await verifyTurnstileToken({
      token: "valid_token_xyz",
      expectedAction: "login", // expected login, but outcome says signup
      env: {
        TURNSTILE_SITE_KEY: "site_key",
        TURNSTILE_SECRET_KEY: "secret_key",
      } as any,
      fetcher: mockFetcher,
    });

    expect(result).toEqual({
      ok: false,
      reason: "invalid_turnstile_token",
    });
  });

  it("rejects when outcome hostname is not in allowed hostnames", async () => {
    const mockFetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          action: "login",
          hostname: "evil.example",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const result = await verifyTurnstileToken({
      token: "valid_token_xyz",
      expectedAction: "login",
      expectedHostnames: ["gh-store.me"],
      env: {
        TURNSTILE_SITE_KEY: "site_key",
        TURNSTILE_SECRET_KEY: "secret_key",
      } as any,
      fetcher: mockFetcher,
    });

    expect(result).toEqual({
      ok: false,
      reason: "invalid_turnstile_token",
    });
  });

  it("rejects invalid token with invalid_turnstile_token", async () => {
    const mockFetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          "error-codes": ["invalid-input-response"],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const result = await verifyTurnstileToken({
      token: "forged_token",
      clientIp: "198.51.100.5",
      env: {
        TURNSTILE_SITE_KEY: "site_key",
        TURNSTILE_SECRET_KEY: "secret_key",
      } as any,
      fetcher: mockFetcher,
    });

    expect(result).toEqual({
      ok: false,
      reason: "invalid_turnstile_token",
    });
  });

  it("fails open if Cloudflare siteverify returns 500 error", async () => {
    const mockFetcher = vi.fn().mockResolvedValue(
      new Response("Internal Server Error", { status: 500 }),
    );

    const result = await verifyTurnstileToken({
      token: "any_token",
      env: {
        TURNSTILE_SITE_KEY: "site_key",
        TURNSTILE_SECRET_KEY: "secret_key",
      } as any,
      fetcher: mockFetcher,
    });

    expect(result).toEqual({ ok: true });
  });

  it("fails open if fetch throws a network exception or timeout", async () => {
    const mockFetcher = vi.fn().mockRejectedValue(new Error("Network timeout"));

    const result = await verifyTurnstileToken({
      token: "any_token",
      env: {
        TURNSTILE_SITE_KEY: "site_key",
        TURNSTILE_SECRET_KEY: "secret_key",
      } as any,
      fetcher: mockFetcher,
    });

    expect(result).toEqual({ ok: true });
  });
});

describe("CSP Security Headers", () => {
  it("includes Cloudflare challenges domain for script, frame, and connect", () => {
    const cspHeader = SECURITY_HEADERS.find(
      ([key]) => key === "Content-Security-Policy-Report-Only",
    );
    expect(cspHeader).toBeDefined();
    const policy = cspHeader![1];

    expect(policy).toContain("https://challenges.cloudflare.com");
    expect(policy).toMatch(/script-src[^;]*https:\/\/challenges\.cloudflare\.com/);
    expect(policy).toMatch(/frame-src[^;]*https:\/\/challenges\.cloudflare\.com/);
    expect(policy).toMatch(/connect-src[^;]*https:\/\/challenges\.cloudflare\.com/);
  });
});
