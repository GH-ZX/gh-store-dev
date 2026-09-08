import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ client: { fixture: "catalog" }, search: vi.fn() }));
vi.mock("@/lib/catalog-queries", () => ({ createPublicClient: () => mocks.client }));
vi.mock("@server/lib/services/catalog.service", () => ({ searchCatalog: mocks.search }));

import { loader } from "../../storefront/app/routes/api-search-suggest";

function load(params: Record<string, string>) {
  return loader({
    request: new Request(`https://store.example/api/search/suggest?${new URLSearchParams(params)}`),
    context: { get: () => ({ env: {} }) },
    params: {},
  } as unknown as Parameters<typeof loader>[0]);
}

beforeEach(() => mocks.search.mockResolvedValue({ games: [], offers: [] }));

describe("catalog search suggestions", () => {
  it.each(["topup", "gift_card", "offers"])("uses the selected %s type instead of suggesting unrelated items", async (filter) => {
    await load({ locale: "en", q: " Steam ", type: filter });
    expect(mocks.search).toHaveBeenCalledExactlyOnceWith(mocks.client, "en", "Steam", filter);
  });

  it("normalizes search input identically to the results page", async () => {
    await load({ locale: "unsupported", q: `  ${"x".repeat(90)}  `, type: "unknown" });
    expect(mocks.search).toHaveBeenCalledExactlyOnceWith(mocks.client, "ar", "x".repeat(80), "all");
  });

  it("returns an empty response without reading the catalog for a blank query", async () => {
    const response = await load({ q: "  " });
    expect(await response.json()).toEqual({ products: [], offers: [] });
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it("preserves real category paths and only returns navigable offers", async () => {
    mocks.search.mockResolvedValue({
      games: [{ slug: "assistant", categorySlug: "ai", name: "Assistant" }],
      offers: [
        { slug: "monthly", name: "Monthly", game: { slug: "assistant", categorySlug: "ai" } },
        { slug: "unavailable", name: "Unavailable", game: null },
      ],
    });
    const response = await load({ locale: "en", q: "assistant" });
    expect(await response.json()).toEqual({
      products: [{ slug: "assistant", categorySlug: "ai", name: "Assistant" }],
      offers: [{ gameSlug: "assistant", categorySlug: "ai", offerSlug: "monthly", name: "Monthly" }],
    });
    expect(response.headers.get("Cache-Control")).toContain("s-maxage=60");
  });
});
