import { describe, expect, it } from "vitest";
import { resolveCachePolicy } from "../../storefront/workers/request-policy";
import { EARLY_HINT_PRELOADS } from "../../storefront/workers/response-headers";

describe("edge cache policy and early hints", () => {
  it("resolves product pages to a 1-hour cache policy with specific cache tags", () => {
    const request = new Request("https://gh-store.me/ar/ai/gemini-18-months-16");
    const policy = resolveCachePolicy(request);

    expect(policy.ttlSeconds).toBe(3600);
    expect(policy.tags).toContain("catalog");
    expect(policy.tags).toContain("category-ai");
    expect(policy.tags).toContain("product-gemini-18-months-16");
  });

  it("resolves category landing pages to a 5-minute cache policy", () => {
    const request = new Request("https://gh-store.me/en/ai");
    const policy = resolveCachePolicy(request);

    expect(policy.ttlSeconds).toBe(300);
    expect(policy.tags).toContain("catalog");
    expect(policy.tags).toContain("category-ai");
  });

  it("resolves homepage to a 1-minute cache policy", () => {
    const request = new Request("https://gh-store.me/ar");
    const policy = resolveCachePolicy(request);

    expect(policy.ttlSeconds).toBe(60);
    expect(policy.tags).toContain("home");
    expect(policy.tags).toContain("catalog");
  });

  it("defines essential early hints preloads for fonts and brand assets", () => {
    expect(EARLY_HINT_PRELOADS).toContain("https://fonts.googleapis.com");
    expect(EARLY_HINT_PRELOADS).toContain("https://fonts.gstatic.com");
    expect(EARLY_HINT_PRELOADS).toContain("/gh-store-logo-mark.png");
  });
});
