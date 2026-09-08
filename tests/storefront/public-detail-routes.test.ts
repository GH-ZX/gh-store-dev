import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  client: { fixture: "public-catalog" },
  product: vi.fn(),
  offer: vi.fn(),
  costs: vi.fn(async (offers) => offers),
  session: vi.fn(() => { throw new Error("Redirects must not read a session"); }),
}));
vi.mock("@/lib/catalog-queries", () => ({
  createPublicClient: () => mocks.client,
  getProductDetail: mocks.product,
  getOfferDetail: mocks.offer,
}));
vi.mock("@server/lib/services/catalog-admin-costs.service", () => ({ withAdminOfferCosts: mocks.costs }));
vi.mock("@server/session", () => ({ createSessionClient: mocks.session }));

import { loader as productLoader, meta as productMeta } from "../../storefront/app/routes/locale-product";
import { loader as offerLoader, meta as offerMeta } from "../../storefront/app/routes/locale-offer";
import { loader as layoutLoader } from "../../storefront/app/routes/locale-layout";
import { loader as rootLoader } from "../../storefront/app/routes/root-index";
import { loader as unlocalizedLoader } from "../../storefront/app/routes/unlocalized";
import { loader as operationsLoader } from "../../storefront/app/routes/dashboard-operations";

function args(path: string, params: Record<string, string>) {
  return {
    request: new Request(`https://store.example${path}`),
    params,
    context: { get: () => ({ env: {} }) },
  } as unknown as Parameters<typeof productLoader>[0];
}

async function thrown(run: () => unknown): Promise<Response> {
  try {
    await run();
    throw new Error("Expected the loader to throw a response");
  } catch (response) {
    expect(response).toBeInstanceOf(Response);
    return response as Response;
  }
}

beforeEach(() => {
  mocks.product.mockResolvedValue({ product: { id: "item", slug: "assistant", categorySlug: "ai" }, offers: [] });
  mocks.offer.mockResolvedValue({
    product: { id: "item", slug: "assistant", categorySlug: "ai" },
    offer: { id: "offer", slug: "monthly" }, relatedOffers: [], inputFields: [],
  });
});

describe("public catalog canonical routes", () => {
  it.each(["games", "services", "products"])("redirects a previous %s category to the product's current category", async (category) => {
    const response = await thrown(() => productLoader(args(`/en/${category}/assistant?ref=bookmark`, { locale: "en", category, slug: "assistant" })));
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("/en/ai/assistant?ref=bookmark");
    expect(mocks.product).toHaveBeenCalledExactlyOnceWith(mocks.client, "en", "assistant", null);
    expect(mocks.costs).not.toHaveBeenCalled();
  });

  it("preserves the requested offer and query when its product moves category", async () => {
    const request = args("/ar/design/assistant/monthly?ref=shared", { locale: "ar", category: "design", slug: "assistant", offerSlug: "monthly" });
    const response = await thrown(() => offerLoader(request as unknown as Parameters<typeof offerLoader>[0]));
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("/ar/ai/assistant/monthly?ref=shared");
    expect(mocks.offer).toHaveBeenCalledExactlyOnceWith(mocks.client, "ar", null, "assistant", "monthly");
  });

  it("serves uncategorized active products through the products URL", async () => {
    mocks.product.mockResolvedValueOnce({ product: { id: "item", slug: "assistant", categorySlug: "products" }, offers: [] });
    const result = await productLoader(args("/en/products/assistant", { locale: "en", category: "products", slug: "assistant" }));
    expect(result).toMatchObject({ category: "products", product: { slug: "assistant" } });
  });

  it("returns a genuine 404 when the product or offer is missing", async () => {
    mocks.product.mockResolvedValueOnce(null);
    mocks.offer.mockResolvedValueOnce(null);
    const product = await thrown(() => productLoader(args("/en/games/missing", { locale: "en", category: "games", slug: "missing" })));
    const offer = await thrown(() => offerLoader(args("/en/games/missing/monthly", { locale: "en", category: "games", slug: "missing", offerSlug: "monthly" }) as unknown as Parameters<typeof offerLoader>[0]));
    expect(product.status).toBe(404);
    expect(offer.status).toBe(404);
  });

  it("does not relabel a catalog outage as a missing product", async () => {
    const failure = new Error("Catalog temporarily unavailable");
    mocks.product.mockRejectedValueOnce(failure);
    await expect(productLoader(args("/en/ai/assistant", { locale: "en", category: "ai", slug: "assistant" }))).rejects.toBe(failure);
  });
});

describe("default locale and compatibility destinations", () => {
  it("permanently redirects the root while preserving its query", async () => {
    const response = await thrown(() => rootLoader({ request: new Request("https://store.example/?ref=home") }));
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("/ar?ref=home");
  });

  it.each(["/products?page=2", "/games/item/offer", "/orders/id/invoice"])("permanently localizes the document path %s", async (path) => {
    const response = await thrown(() => unlocalizedLoader({ request: new Request(`https://store.example${path}`) }));
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(`/ar${path}`);
  });

  it.each(["/api/missing", "/auth/missing", "/missing.png", "/assets/missing.js"])("leaves missing resource %s as 404 even when it matches the dynamic locale layout", async (path) => {
    const response = await thrown(() => layoutLoader(args(path, { locale: path.split("/")[1] }) as unknown as Parameters<typeof layoutLoader>[0]));
    expect(response.status).toBe(404);
    expect(mocks.session).not.toHaveBeenCalled();
  });

  it("restores the documented operations bookmark to the existing logs view", async () => {
    const response = await thrown(() => operationsLoader(args("/en/dashboard/operations?view=syncs", { locale: "en" }) as unknown as Parameters<typeof operationsLoader>[0]));
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("/en/dashboard/logs?view=syncs");
  });
});

describe("catalog detail search metadata", () => {
  const product = {
    slug: "assistant", categorySlug: "products", categoryName: null,
    name: "Assistant", description: null, imageUrl: null, logoUrl: "/assistant-logo.png",
  };
  const offer = {
    id: "monthly-id", slug: "monthly", name: "Monthly", description: null,
    imageUrl: null, price: 12, currency: "USD",
  };

  it("publishes a useful description, canonical generic product URL and visible breadcrumb hierarchy", () => {
    const meta = productMeta({ params: { locale: "en", category: "products", slug: "assistant" }, matches: [
      { id: "routes/locale-product", loaderData: { product, category: "products", siteUrl: "https://store.example" } },
    ] } as unknown as Parameters<typeof productMeta>[0]);
    expect(meta).toContainEqual({ name: "description", content: expect.stringContaining("Browse Assistant offers") });
    expect(meta).toContainEqual({ tagName: "link", rel: "canonical", href: "https://store.example/en/products/assistant" });
    expect(meta).toContainEqual({ property: "og:image", content: "https://store.example/assistant-logo.png" });
    expect(meta.filter((entry) => "script:ld+json" in entry)).toEqual([
      { "script:ld+json": expect.objectContaining({ "@type": "BreadcrumbList", itemListElement: [
        expect.objectContaining({ item: "https://store.example/en" }),
        expect.objectContaining({ item: "https://store.example/en/products" }),
        expect.objectContaining({ item: "https://store.example/en/products/assistant" }),
      ] }) },
    ]);
  });

  it("adds structured price data only for the specific offer with its canonical URL", () => {
    const meta = offerMeta({ params: { locale: "en", category: "products", slug: "assistant", offerSlug: "monthly" }, matches: [
      { id: "routes/locale-offer", loaderData: { product, offer, category: "products", siteUrl: "https://store.example" } },
    ] } as unknown as Parameters<typeof offerMeta>[0]);
    expect(meta).toContainEqual({ name: "description", content: expect.stringContaining("Monthly for Assistant") });
    expect(meta).toContainEqual({ tagName: "link", rel: "canonical", href: "https://store.example/en/products/assistant/monthly" });
    const structured = meta.filter((entry) => "script:ld+json" in entry).map((entry) => entry["script:ld+json"]);
    expect(structured).toContainEqual(expect.objectContaining({ "@type": "Product", offers: expect.objectContaining({
      "@type": "Offer", price: 12, priceCurrency: "USD", url: "https://store.example/en/products/assistant/monthly",
    }) }));
  });

  it("does not publish product structured data for a missing offer", () => {
    const meta = offerMeta({ params: { locale: "en", category: "products", slug: "missing", offerSlug: "monthly" }, matches: [] } as unknown as Parameters<typeof offerMeta>[0]);
    expect(meta.filter((entry) => "script:ld+json" in entry)).toEqual([]);
  });
});
