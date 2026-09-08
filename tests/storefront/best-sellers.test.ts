import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCache } from "@server/lib/cache";
import { getBestSellers, getOfferRailPage } from "@server/lib/services/home-catalog.service";

const authority = vi.hoisted(() => ({ configured: true, client: vi.fn() }));
vi.mock("@server/lib/supabase/service", () => ({
  hasServiceRoleKey: () => authority.configured,
  createSupabaseServiceClient: authority.client,
}));

function mockClient(results: { data: unknown; error?: unknown; count?: number }[]) {
  const queries: { table: string; calls: [string, unknown[]][] }[] = [];
  const client = {
    from(table: string) {
      const calls: [string, unknown[]][] = [];
      queries.push({ table, calls });
      const result = results.shift() ?? { data: [] };
      const chain: Record<string, unknown> = {};
      for (const method of ["select", "eq", "in", "gte", "order", "limit", "range"]) {
        chain[method] = (...args: unknown[]) => { calls.push([method, args]); return chain; };
      }
      chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(resolve(result));
      return chain;
    },
  } as unknown as SupabaseClient;
  return { client, queries };
}

const offer = (id: string) => ({
  id, slug: id, offer_type: "gift_card", name_en: id, name_ar: id,
  description_en: null, description_ar: null, price: 10, original_price: null,
  currency: "USD", is_sale: false,
  products: { slug: "parent", name_en: "Parent", name_ar: "المنتج", image_url: null, logo_url: null, categories: { slug: "vouchers" } },
});

beforeEach(() => {
  clearCache();
  authority.configured = true;
  authority.client.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe("bestseller ranking integrity", () => {
  it("does not select unrelated catalog offers without ranking authority", async () => {
    authority.configured = false;
    const catalog = mockClient([{ data: [offer("unranked")] }]);
    expect(await getBestSellers(catalog.client, "en", 8)).toEqual([]);
    expect(await getOfferRailPage(catalog.client, "en", "best-sellers", 2))
      .toEqual({ offers: [], total: 0, page: 2, pageSize: 12 });
    expect(authority.client).not.toHaveBeenCalled();
    expect(catalog.queries).toHaveLength(0);
  });

  it("shows an empty list when there are no ranked paid orders", async () => {
    const ranking = mockClient([{ data: [] }]);
    authority.client.mockReturnValue(ranking.client);
    const catalog = mockClient([{ data: [offer("unranked")] }]);
    expect(await getBestSellers(catalog.client, "en", 8)).toEqual([]);
    expect(ranking.queries[0].table).toBe("order_items");
    expect(ranking.queries[0].calls).toContainEqual(["eq", ["orders.payment_status", "paid"]]);
    expect(catalog.queries).toHaveLength(0);
  });

  it("keeps a sparse ranked subset in sales order without random padding", async () => {
    const ranking = mockClient([{ data: [
      { offer_id: "second", quantity: 2 },
      { offer_id: "first", quantity: 3 },
      { offer_id: "first", quantity: 1 },
    ] }]);
    authority.client.mockReturnValue(ranking.client);
    const catalog = mockClient([{ data: [offer("second"), offer("unranked"), offer("first")] }]);
    const result = await getBestSellers(catalog.client, "en", 8);
    expect(result.map((row) => row.id)).toEqual(["first", "second"]);
    expect(catalog.queries).toHaveLength(1);
    expect(catalog.queries[0].table).toBe("offers");
    expect(catalog.queries[0].calls).toContainEqual(["in", ["id", ["first", "second"]]]);
    expect(catalog.queries[0].calls).toContainEqual(["eq", ["is_active", true]]);
    expect(catalog.queries[0].calls).toContainEqual(["eq", ["products.is_active", true]]);
    expect(result.every((row) => !("quantity" in row) && !("orders" in row))).toBe(true);
  });

  it("omits ranked offers that are no longer public without replacing them", async () => {
    const ranking = mockClient([{ data: [
      { offer_id: "hidden", quantity: 5 }, { offer_id: "visible", quantity: 1 },
    ] }]);
    authority.client.mockReturnValue(ranking.client);
    const catalog = mockClient([{ data: [offer("visible")] }]);
    expect((await getBestSellers(catalog.client, "en", 8)).map((row) => row.id)).toEqual(["visible"]);
    expect(catalog.queries).toHaveLength(1);
  });

  it("paginates only the ranked active subset and reports its actual total", async () => {
    const ids = Array.from({ length: 15 }, (_, index) => `ranked-${index + 1}`);
    const ranking = mockClient([{ data: ids.map((id, index) => ({ offer_id: id, quantity: 15 - index })) }]);
    authority.client.mockReturnValue(ranking.client);
    const catalog = mockClient([{ data: ids.toReversed().map(offer) }]);
    const result = await getOfferRailPage(catalog.client, "en", "best-sellers", 2);
    expect(result).toMatchObject({ total: 15, page: 2, pageSize: 12 });
    expect(result.offers.map((row) => row.id)).toEqual(["ranked-13", "ranked-14", "ranked-15"]);
    expect(catalog.queries).toHaveLength(1);
  });

  it("returns no claimed bestsellers and logs a neutral warning when ranking fails", async () => {
    const ranking = mockClient([{ data: null, error: new Error("Private service failure") }]);
    authority.client.mockReturnValue(ranking.client);
    const catalog = mockClient([{ data: [offer("unranked")] }]);
    expect(await getOfferRailPage(catalog.client, "en", "best-sellers", 1))
      .toEqual({ offers: [], total: 0, page: 1, pageSize: 12 });
    expect(catalog.queries).toHaveLength(0);
    expect(console.warn).toHaveBeenCalledExactlyOnceWith("Bestseller rankings are temporarily unavailable.");
  });

  it("keeps an offer lookup outage from generating a substitute ranking", async () => {
    const ranking = mockClient([{ data: [{ offer_id: "first", quantity: 3 }] }]);
    authority.client.mockReturnValue(ranking.client);
    const catalog = mockClient([{ data: null, error: new Error("Public offer lookup failure") }]);
    expect(await getBestSellers(catalog.client, "en", 8)).toEqual([]);
    expect(catalog.queries).toHaveLength(1);
    expect(console.warn).toHaveBeenCalledOnce();
  });
});
