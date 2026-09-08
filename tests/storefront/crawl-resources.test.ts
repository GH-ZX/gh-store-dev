import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRobotsTxt, loader as robotsLoader } from "@/routes/robots-txt";
import { loader as sitemapLoader } from "@/routes/sitemap-xml";

const catalog = vi.hoisted(() => ({ products: vi.fn(), categories: vi.fn() }));
vi.mock("@/lib/catalog-queries", () => ({
  createPublicClient: () => ({}),
  getSitemapSlugs: catalog.products,
  getSitemapCategories: catalog.categories,
}));

const context = { get: () => ({ env: { APP_URL: "https://shop.example/" } }) };

/** Google's longest matching path rule, including Allow precedence for ties. */
function mayCrawl(path: string, body = buildRobotsTxt("https://shop.example")): boolean {
  const matches = body.split("\n").flatMap((line) => {
    const rule = /^(Allow|Disallow): (.+)$/.exec(line);
    if (!rule) return [];
    const [, directive, pattern] = rule;
    const exact = pattern.endsWith("$");
    const source = exact ? pattern.slice(0, -1) : pattern;
    const escaped = source.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*");
    return new RegExp(`^${escaped}${exact ? "$" : ""}`).test(path)
      ? [{ allow: directive === "Allow", length: pattern.length }]
      : [];
  }).sort((a, b) => b.length - a.length || Number(b.allow) - Number(a.allow));
  return matches[0]?.allow ?? true;
}

describe("robots crawl rules", () => {
  it("allows the public catalog, product artwork, and crawlable noindex search pages", () => {
    for (const path of [
      "/ar", "/en/products", "/ar/games/pubgm", "/en/products/email-account/monthly",
      "/ar/search?q=pubg", "/en/search", "/assets/store.css",
      "/api/media-proxy?url=https%3A%2F%2Fimages.example%2Fproduct.png&v=2",
    ]) {
      expect(mayCrawl(path), path).toBe(true);
    }
  });

  it("does not mistake public product names for private route segments", () => {
    for (const path of ["/en/services/search-assistant", "/ar/products/profile-tool", "/en/ai/cart-helper", "/en/vouchers/checkout-credit", "/en/profile-design"]) {
      expect(mayCrawl(path), path).toBe(true);
    }
  });

  it("retains private account and API exclusions at exact route boundaries", () => {
    for (const path of [
      "/api/reconcile", "/api/admin-actions", "/auth/callback?code=test",
      "/ar/profile", "/en/profile?tab=settings", "/ar/profile/security",
      "/en/checkout/product/package", "/ar/orders/id/invoice", "/en/dashboard/catalog",
    ]) {
      expect(mayCrawl(path), path).toBe(false);
    }
  });

  it("serves the sitemap location with a bounded refresh period", async () => {
    const response = await robotsLoader({ context } as unknown as Parameters<typeof robotsLoader>[0]);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toContain("s-maxage=3600");
    expect(await response.text()).toContain("Sitemap: https://shop.example/sitemap.xml");
  });
});

describe("localized XML sitemap", () => {
  beforeEach(() => {
    catalog.products.mockReset().mockResolvedValue([
      { slug: "assistant", categorySlug: "ai" },
      { slug: "email-account", categorySlug: "products" },
    ]);
    catalog.categories.mockReset().mockResolvedValue(["ai", "products"]);
  });

  it("includes canonical uncategorized products and reciprocal locale variants", async () => {
    const response = await sitemapLoader({ context } as unknown as Parameters<typeof sitemapLoader>[0]);
    const xml = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/xml; charset=utf-8");
    expect(xml).toContain("<loc>https://shop.example/en/products/email-account</loc>");
    expect(xml).toContain('hreflang="x-default" href="https://shop.example/ar/products/email-account"');
    expect(xml).toContain('hreflang="en" href="https://shop.example/en/products/email-account"');
    expect(xml).toContain('hreflang="ar" href="https://shop.example/ar/products/email-account"');
    const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]);
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls.every((url) => mayCrawl(new URL(url).pathname))).toBe(true);
    expect(xml).not.toContain("/search");
    expect(xml).not.toContain("/checkout");
  });

  it("encodes catalog slug characters into valid URL paths", async () => {
    catalog.products.mockResolvedValue([{ slug: "gift & credit", categorySlug: "cards" }]);
    const response = await sitemapLoader({ context } as unknown as Parameters<typeof sitemapLoader>[0]);
    expect(await response.text()).toContain("https://shop.example/en/cards/gift%20%26%20credit");
  });

  it.each(["products", "categories"] as const)("does not cache an incomplete sitemap when %s fail", async (query) => {
    catalog[query].mockRejectedValue(new Error("Temporary catalog outage"));
    const response = await sitemapLoader({ context } as unknown as Parameters<typeof sitemapLoader>[0]);
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(await response.text()).not.toContain("<urlset");
  });
});
