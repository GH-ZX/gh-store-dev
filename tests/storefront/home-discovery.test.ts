import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getHomeDiscoveryCategories } from "@server/lib/services/home-discovery.service";
import { createHomeSection, getHomeSectionPagePath } from "@/lib/home/layout";

vi.mock("@server/lib/logging/logger", () => ({ logFailure: vi.fn() }));

function category(id: string, count: number) {
  return { id, slug: id, name_ar: "منتجات", name_en: "Products", image_url: null, products: [{ count }] };
}

function clientFor(data: ReturnType<typeof category>[] | null, error: unknown = null) {
  const query = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue({ data, error }),
  };
  return { client: { from: vi.fn().mockReturnValue(query) } as unknown as SupabaseClient, query };
}

describe("home category discovery", () => {
  it("uses exact active-product aggregates, skips empty categories and localizes names", async () => {
    const { client, query } = clientFor([category("empty", 0), category("large", 1205), category("small", 1)]);
    const items = await getHomeDiscoveryCategories(client, "ar");
    expect(query.select).toHaveBeenCalledWith(expect.stringContaining("products!products_category_id_fkey(count)"));
    expect(query.eq).toHaveBeenCalledWith("is_active", true);
    expect(query.eq).toHaveBeenCalledWith("products.is_active", true);
    expect(items.map(({ slug, name, productCount }) => ({ slug, name, productCount }))).toEqual([
      { slug: "large", name: "منتجات", productCount: 1205 },
      { slug: "small", name: "منتجات", productCount: 1 },
    ]);
  });

  it("does not let supplemental discovery failures break the homepage or invent counts", async () => {
    const { client } = clientFor([category("stale", 9)], { message: "unavailable" });
    expect(await getHomeDiscoveryCategories(client, "en")).toEqual([]);
  });

  it("bounds navigation after excluding empty results and falls back to the other language", async () => {
    const row = { ...category("fallback", 1), name_en: "", name_ar: "اسم المنتج" };
    const { client } = clientFor([category("empty", 0), row, ...Array.from({ length: 12 }, (_, i) => category(`category-${i}`, 1))]);
    const items = await getHomeDiscoveryCategories(client, "en");
    expect(items).toHaveLength(8);
    expect(items[0].name).toBe("اسم المنتج");
  });

  it("keeps generic product picks linked to the full product catalog", () => {
    expect(getHomeSectionPagePath(createHomeSection("product_picks", "picks"))).toBe("/products");
    expect(getHomeSectionPagePath(createHomeSection("games", "games"))).toBe("/games");
    expect(getHomeSectionPagePath(createHomeSection("offer_picks", "offers"))).toBe("/products");
    expect(getHomeSectionPagePath(createHomeSection("sale_offers", "sale"))).toBe("/sale");
  });
});
