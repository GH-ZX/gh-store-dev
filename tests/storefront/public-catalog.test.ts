import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getProductsByIds, getOfferRailPage } from "@server/lib/services/home-catalog.service";
import { searchCatalog } from "@server/lib/services/catalog.service";
import { getSitemapSlugs, getCatalogPage, getCategoryPage, getAllProductsPage } from "@/lib/catalog-queries";
import { getHomeLayout } from "@server/lib/services/settings.service";

function mockClient(results: { data: unknown; error?: unknown; count?: number }[]) {
  const queries: { table: string; calls: [string, unknown[]][] }[] = [];
  const client = {
    from(table: string) {
      const calls: [string, unknown[]][] = [];
      queries.push({ table, calls });
      const result = results.shift() ?? { data: [] };
      const chain: Record<string, unknown> = {};
      for (const method of ["select", "eq", "in", "order", "limit", "or", "range", "maybeSingle"]) {
        chain[method] = (...args: unknown[]) => { calls.push([method, args]); return chain; };
      }
      chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(resolve(result));
      return chain;
    },
  } as unknown as SupabaseClient;
  return { client, queries };
}
const product = (id: string) => ({ id, slug: id, name_ar: id, name_en: id, categories: { slug: "ai" } });

describe("restored public catalog data", () => {
  it("keeps configured product picks in admin order and adds cheapest active offer prices", async () => {
    const { client, queries } = mockClient([
      { data: [product("first"), product("second")] },
      { data: [{ product_id: "second", price: 8 }, { product_id: "second", price: 3 }] },
    ]);
    const products = await getProductsByIds(client, "en", ["second", "missing", "first"]);
    expect(products.map((row) => row.id)).toEqual(["second", "first"]);
    expect(products[0].priceFrom).toBe(3);
    expect(queries[0].calls).toContainEqual(["eq", ["is_active", true]]);
    expect(queries[1].calls).toContainEqual(["eq", ["is_active", true]]);
  });

  it("searches offers belonging to a matched product and strips PostgREST filter syntax", async () => {
    const { client, queries } = mockClient([{ data: [product("parent")] }, { data: [] }]);
    const result = await searchCatalog(client, "en", 'PUBG, (UC)%', "all");
    expect(result.games[0].id).toBe("parent");
    expect(queries[0].calls.filter(([name]) => name === "or")).toHaveLength(2);
    const offerFilters = queries[1].calls.filter(([name]) => name === "or");
    expect(offerFilters).toHaveLength(2);
    expect(offerFilters[0][1][0]).toContain("product_id.in.(parent)");
    expect(offerFilters[1][1][0]).toContain("name_en.ilike.%uc%");
    expect(queries[1].calls).toContainEqual(["eq", ["products.is_active", true]]);
  });

  it("narrows product search by active gift-card and redeem-code offers", async () => {
    const { client, queries } = mockClient([
      { data: [product("topup"), product("voucher")] }, { data: [{ product_id: "voucher" }] },
    ]);
    const result = await searchCatalog(client, "en", "item", "gift_card");
    expect(result.games.map((row) => row.id)).toEqual(["voucher"]);
    expect(result.offers).toEqual([]);
    expect(queries[1].calls).toContainEqual(["in", ["offer_type", ["gift_card", "redeem_code"]]]);
  });

  it("keeps actual canonical categories in sitemap identities", async () => {
    const { client, queries } = mockClient([{ data: [
      { slug: "assistant", categories: { slug: "ai" } },
      { slug: "voucher", categories: [{ slug: "vouchers" }] },
      { slug: "orphan", categories: null },
    ] }]);
    expect(await getSitemapSlugs(client)).toEqual([
      { slug: "assistant", categorySlug: "ai" }, { slug: "voucher", categorySlug: "vouchers" },
    ]);
    expect(queries[0].calls).toContainEqual(["eq", ["categories.is_active", true]]);
  });

  it("loads configured homepage sections through the public RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ id: "custom", type: "sale_offers", title_en: "Custom sale", limit: 3 }], error: null });
    const sections = await getHomeLayout({ rpc } as unknown as SupabaseClient);
    expect(rpc).toHaveBeenCalledWith("get_home_layout");
    expect(sections).toEqual([expect.objectContaining({ id: "custom", type: "sale_offers", titleEn: "Custom sale", limit: 3 })]);
  });

  it("filters both games and category product pages through an inner category join", async () => {
    const games = mockClient([{ data: [] }]);
    await getCatalogPage(games.client, "en", 1);
    expect(games.queries[0].calls.find(([name]) => name === "select")?.[1][0]).toContain("categories!products_category_id_fkey!inner(");
    expect(games.queries[0].calls).toContainEqual(["eq", ["categories.slug", "games"]]);

    const category = mockClient([{ data: { slug: "ai", name_ar: "AI", name_en: "AI" } }, { data: [] }]);
    await getCategoryPage(category.client, "en", "ai", 1);
    expect(category.queries[1].calls.find(([name]) => name === "select")?.[1][0]).toContain("categories!products_category_id_fkey!inner(");
    expect(category.queries[1].calls).toContainEqual(["eq", ["categories.slug", "ai"]]);
  });

  it("paginates all sale offers instead of truncating the collection to a rail", async () => {
    const { client, queries } = mockClient([{ data: [], count: 60 }]);
    expect(await getOfferRailPage(client, "en", "sale", 3)).toEqual({ offers: [], total: 60, page: 3, pageSize: 12 });
    expect(queries[0].calls).toContainEqual(["range", [24, 35]]);
    expect(queries[0].calls).toContainEqual(["eq", ["is_sale", true]]);
  });

  it("serves the bestseller catalog fallback when sales ranking is unavailable", async () => {
    const { client, queries } = mockClient([{ data: [], count: 96 }]);
    expect(await getOfferRailPage(client, "en", "best-sellers", 2)).toEqual({ offers: [], total: 96, page: 2, pageSize: 12 });
    expect(queries[0].calls).toContainEqual(["range", [12, 23]]);
    expect(queries[0].calls).toContainEqual(["order", ["created_at", { ascending: false }]]);
  });


  it("keeps products visible when decorative starting-price queries fail", async () => {
    for (const read of [getCatalogPage, getAllProductsPage]) {
      const { client } = mockClient([{ data: [product("visible")] }, { data: null, error: { message: "price read unavailable" } }]);
      expect((await read(client, "en", 1)).products[0].id).toBe("visible");
    }
    const { client } = mockClient([
      { data: { slug: "ai", name_ar: "AI", name_en: "AI" } },
      { data: [product("visible")] },
      { data: null, error: { message: "price read unavailable" } },
    ]);
    expect((await getCategoryPage(client, "en", "ai", 1))?.products[0].id).toBe("visible");
  });

});
