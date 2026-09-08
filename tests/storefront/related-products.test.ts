import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getRelatedProducts } from "@/lib/catalog/related-products";

function clientFor(results: { data?: unknown; error?: unknown }[]) {
  const queries: [string, unknown[]][][] = [];
  return {
    queries,
    client: {
      from() {
        const calls: [string, unknown[]][] = [];
        queries.push(calls);
        const result = results.shift() ?? { data: [] };
        const chain: Record<string, unknown> = {};
        for (const method of ["select", "eq", "neq", "order", "limit", "abortSignal"]) {
          chain[method] = (...args: unknown[]) => { calls.push([method, args]); return chain; };
        }
        chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(resolve(result));
        return chain;
      },
    } as unknown as SupabaseClient,
  };
}
const current = { id: "current", categorySlug: "games", kind: "game" as const };
const candidate = (id: string, currency = "USD") => ({
  id, slug: id, name_en: id, name_ar: id, categories: { slug: "games" },
  offers: [{ price: 3.5, currency }],
});

describe("optional product discovery", () => {
  it("uses active offers in the same category, preserves catalog ordering, and excludes the current item", async () => {
    const { client, queries } = clientFor([{ data: [candidate("second"), candidate("first")] }]);
    const result = await getRelatedProducts(client, "en", current);
    expect(result.scope).toBe("category");
    expect(result.products.map((product) => product.id)).toEqual(["second", "first"]);
    expect(result.products[0].priceFrom).toBe(3.5);
    expect(queries[0]).toContainEqual(["eq", ["is_active", true]]);
    expect(queries[0]).toContainEqual(["eq", ["offers.is_active", true]]);
    expect(queries[0]).toContainEqual(["eq", ["categories.slug", "games"]]);
    expect(queries[0]).toContainEqual(["neq", ["id", "current"]]);
    expect(queries[0]).toContainEqual(["order", ["sort_order", { ascending: true }]]);
    expect(queries[0]).toContainEqual(["limit", [4]]);
    expect(queries[0]).toContainEqual(["limit", [1, { referencedTable: "offers" }]]);
  });

  it("labels an empty-category fallback as catalog discovery, not related category items", async () => {
    const { client, queries } = clientFor([{ data: [] }, { data: [candidate("another")] }]);
    const result = await getRelatedProducts(client, "en", current);
    expect(result.scope).toBe("catalog");
    expect(result.products).toHaveLength(1);
    expect(queries).toHaveLength(2);
    expect(queries[1].find(([name, args]) => name === "eq" && args[0] === "categories.slug")).toBeUndefined();
  });

  it("uses the actual product kind for uncategorized items when one is known", async () => {
    const { client, queries } = clientFor([{ data: [candidate("subscription")] }]);
    const result = await getRelatedProducts(client, "en", { ...current, categorySlug: "products", kind: "subscription" });
    expect(result.scope).toBe("kind");
    expect(queries[0]).toContainEqual(["eq", ["product_kind", "subscription"]]);
  });

  it("does not invent USD prices for other currencies or recommend products without offers", async () => {
    const { client } = clientFor([{ data: [candidate("euro", "EUR"), { ...candidate("empty"), offers: [] }] }]);
    const result = await getRelatedProducts(client, "en", current);
    expect(result.products.map((product) => product.id)).toEqual(["euro"]);
    expect(result.products[0].priceFrom).toBeUndefined();
  });

  it("fails independently when the discovery query is unavailable", async () => {
    const { client, queries } = clientFor([{ error: { message: "unavailable" } }]);
    expect(await getRelatedProducts(client, "en", current)).toEqual({ products: [], scope: "catalog" });
    expect(queries).toHaveLength(1);
  });
});
