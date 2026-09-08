import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), client: vi.fn() }));
vi.mock("@server/lib/auth/guards", () => ({ requireAdmin: mocks.admin }));
vi.mock("@server/lib/supabase/server", () => ({ createSupabaseServerClient: mocks.client }));
import { getCatalogReadiness } from "@server/lib/services/admin-readiness.service";

type Product = { id: string; name_ar: string; name_en: string; image_url: string | null; category_id: string | null; is_active: boolean };
type Offer = { product_id: string; is_active: boolean };
const product = (id: string, overrides: Partial<Product> = {}): Product => ({
  id, name_ar: `منتج ${id}`, name_en: `Product ${id}`, image_url: "/cover.webp", category_id: "category", is_active: true, ...overrides,
});

function database(products: Product[], offers: Offer[], options: { cap?: number; fail?: string; failAfter?: number; nullData?: boolean } = {}) {
  const ranges = vi.fn();
  const filters = vi.fn();
  mocks.client.mockResolvedValue({
    from: (table: string) => {
      let activeOnly = false;
      const query = {
        select: () => query,
        eq: (key: string, value: unknown) => { filters(table, key, value); activeOnly = key === "is_active" && value === true; return query; },
        order: () => query,
        range: async (start: number, end: number) => {
          ranges(table, start, end);
          if (table === options.fail && start >= (options.failAfter ?? 0)) return { data: null, error: { message: "Read failed" } };
          if (options.nullData) return { data: null, error: null };
          const all = table === "products" ? products : offers;
          const rows = activeOnly ? all.filter((row) => row.is_active) : all;
          return { data: rows.slice(start, Math.min(end + 1, start + (options.cap ?? 1000))), error: null };
        },
      };
      return query;
    },
  });
  return { ranges, filters };
}

beforeEach(() => { mocks.admin.mockResolvedValue({ id: "admin" }); });

describe("published catalog readiness", () => {
  it("counts distinct unfinished products and checks actual active offers, category and configured image", async () => {
    const { filters } = database([
      product("ready"),
      product("missing-all", { image_url: "  ", category_id: null }),
      product("category-only", { category_id: null }),
      product("art-only", { image_url: null }),
      product("draft", { is_active: false, image_url: null, category_id: null }),
    ], [
      { product_id: "ready", is_active: true },
      { product_id: "missing-all", is_active: false },
      { product_id: "category-only", is_active: true },
      { product_id: "art-only", is_active: true },
    ]);
    const result = await getCatalogReadiness();
    expect(result).toMatchObject({ publishedProducts: 4, missingOffers: 1, missingArtwork: 2, missingCategory: 2, needsAttention: 3 });
    expect(result?.items.map((item) => item.id)).toEqual(["missing-all", "category-only", "art-only"]);
    expect(result?.items[0]).toMatchObject({ missingOffers: true, missingArtwork: true, missingCategory: true });
    expect(filters).toHaveBeenCalledWith("products", "is_active", true);
    expect(filters).toHaveBeenCalledWith("offers", "is_active", true);
  });

  it("reads beyond 1,000 products and offers before counting or limiting the preview", async () => {
    const products = Array.from({ length: 1008 }, (_, index) => product(String(index).padStart(4, "0"), { category_id: index > 999 ? null : "category" }));
    const { ranges } = database(products, products.map((row) => ({ product_id: row.id, is_active: true })));
    const result = await getCatalogReadiness();
    expect(result).toMatchObject({ publishedProducts: 1008, missingOffers: 0, missingCategory: 8, needsAttention: 8 });
    expect(result?.items).toHaveLength(6);
    expect(ranges).toHaveBeenCalledWith("products", 1000, 1999);
    expect(ranges).toHaveBeenCalledWith("offers", 1000, 1999);
  });

  it("continues after short pages when the server caps responses below the requested range", async () => {
    const products = Array.from({ length: 5 }, (_, index) => product(String(index)));
    const { ranges } = database(products, products.map((row) => ({ product_id: row.id, is_active: true })), { cap: 2 });
    const result = await getCatalogReadiness();
    expect(result).toMatchObject({ publishedProducts: 5, missingOffers: 0, needsAttention: 0 });
    expect(ranges.mock.calls.filter(([table]) => table === "products").map(([, start]) => start)).toEqual([0, 2, 4, 5]);
  });

  it.each(["products", "offers"])("discards partial %s reads instead of reporting false missing data", async (table) => {
    const products = [product("1"), product("2"), product("3")];
    database(products, products.map((row) => ({ product_id: row.id, is_active: true })), { cap: 2, fail: table, failAfter: 2 });
    await expect(getCatalogReadiness()).resolves.toBeNull();
  });

  it("does not treat a null response as an empty catalog", async () => {
    database([], [], { nullData: true });
    await expect(getCatalogReadiness()).resolves.toBeNull();
  });

  it("returns real zero counts for a successfully read empty catalog", async () => {
    database([], []);
    await expect(getCatalogReadiness()).resolves.toEqual({ publishedProducts: 0, missingOffers: 0, missingArtwork: 0, missingCategory: 0, needsAttention: 0, items: [] });
  });

  it("requires administrator access before reading any catalog data", async () => {
    mocks.admin.mockRejectedValueOnce(new Error("Unauthorized"));
    await expect(getCatalogReadiness()).rejects.toThrow("Unauthorized");
    expect(mocks.client).not.toHaveBeenCalled();
  });
});
