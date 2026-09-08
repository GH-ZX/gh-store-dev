import { describe, expect, it } from "vitest";
import { resolveCachePolicy } from "../../storefront/workers/request-policy";
import { EARLY_HINT_PRELOADS } from "../../storefront/workers/response-headers";

describe("edge cache policy and early hints", () => {
  it("keeps product pages at a short 30-second TTL with specific cache tags", () => {
    const request = new Request("https://gh-store.me/ar/ai/gemini-18-months-16");
    const policy = resolveCachePolicy(request);

    expect(policy.ttlSeconds).toBe(30);
    expect(policy.tags).toContain("catalog");
    expect(policy.tags).toContain("category-ai");
    expect(policy.tags).toContain("product-gemini-18-months-16");
  });

  it("keeps category landing pages at the same 30-second TTL", () => {
    const request = new Request("https://gh-store.me/en/ai");
    const policy = resolveCachePolicy(request);

    expect(policy.ttlSeconds).toBe(30);
    expect(policy.tags).toContain("catalog");
    expect(policy.tags).toContain("category-ai");
  });

  it("refreshes homepage catalog data within 30 seconds", () => {
    const request = new Request("https://gh-store.me/ar");
    const policy = resolveCachePolicy(request);

    expect(policy.ttlSeconds).toBe(30);
    expect(policy.tags).toContain("home");
    expect(policy.tags).toContain("catalog");
  });

  it.each([
    "/en/products", "/ar/games/pubgm", "/en/products/subscription",
    "/en/ai/assistant/monthly", "/ar/gift-cards?page=2", "/en/sale",
  ])("does not extend the lifetime of prices or activity on %s", (path) => {
    expect(resolveCachePolicy(new Request(`https://gh-store.me${path}`)).ttlSeconds).toBe(30);
  });

  it("defines essential early hints preloads for fonts and brand assets", () => {
    expect(EARLY_HINT_PRELOADS).toContain("https://fonts.googleapis.com");
    expect(EARLY_HINT_PRELOADS).toContain("https://fonts.gstatic.com");
    expect(EARLY_HINT_PRELOADS).toContain("/gh-store-logo-mark.png");
  });
});
