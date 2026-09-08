import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), client: vi.fn() }));
vi.mock("@server/lib/auth/guards", () => ({ requireAdmin: mocks.admin }));
vi.mock("@server/lib/supabase/server", () => ({ createSupabaseServerClient: mocks.client }));
import { getAdminProduct, listAdminProducts } from "@server/legacy/lib/services/admin-catalog.service";

const products = ["empty", "inactive", "ready"].map((id) => ({
  id, slug: id, name_ar: id, name_en: id, image_url: null,
  is_active: true, is_featured: false, show_in_carousel: false, sort_order: 0,
}));
type Offer = { product_id: string; is_active: boolean };

function database(offers: Offer[], failOffers = false) {
  const ranges = vi.fn((start: number, end: number) => Promise.resolve(failOffers
    ? { data: null, error: { message: "Database unavailable" } }
    : { data: offers.slice(start, end + 1), error: null }));
  const select = vi.fn();
  const from = vi.fn((table: string) => {
    const query = Promise.resolve({ data: table === "products" ? products : [], error: null });
    return Object.assign(query, {
      select: (columns: string) => { select(table, columns); return query; },
      order: () => query,
      in: () => query,
      range: ranges,
    });
  });
  mocks.client.mockResolvedValue({ from });
  return { ranges, select };
}

beforeEach(() => { mocks.admin.mockResolvedValue({ id: "admin" }); });

describe("admin catalog offer readiness", () => {
  it("counts active offers separately from inactive offers and empty products", async () => {
    const { select } = database([
      { product_id: "inactive", is_active: false },
      { product_id: "inactive", is_active: false },
      { product_id: "ready", is_active: false },
      { product_id: "ready", is_active: true },
      { product_id: "ready", is_active: true },
    ]);
    const rows = await listAdminProducts();
    expect(rows.map(({ id, offerCount, activeOfferCount }) => ({ id, offerCount, activeOfferCount }))).toEqual([
      { id: "empty", offerCount: 0, activeOfferCount: 0 },
      { id: "inactive", offerCount: 2, activeOfferCount: 0 },
      { id: "ready", offerCount: 3, activeOfferCount: 2 },
    ]);
    expect(select).toHaveBeenCalledWith("offers", "product_id, is_active");
  });

  it("counts offers beyond the default thousand-row response limit", async () => {
    const { ranges } = database([
      ...Array.from({ length: 1000 }, () => ({ product_id: "inactive", is_active: false })),
      { product_id: "ready", is_active: true },
    ]);
    const rows = await listAdminProducts();
    expect(rows.find((row) => row.id === "ready")?.activeOfferCount).toBe(1);
    expect(ranges.mock.calls).toEqual([[0, 999], [1000, 1999]]);
  });

  it("reports count failures instead of mislabeling products as having no active offers", async () => {
    database([], true);
    await expect(listAdminProducts()).rejects.toThrow("Counting offers failed");
  });
});


describe("admin editor offer readiness", () => {
  const productId = "11111111-1111-4111-8111-111111111111";
  function detailDatabase(activeCount: number | null) {
    const displayedOffers = Array.from({ length: 1000 }, (_, index) => ({
      id: `offer-${index}`, product_id: productId, is_active: false,
      provider_offer_mappings: [],
    }));
    const countFilters = vi.fn();
    const countQuery = Promise.resolve({ data: null, count: activeCount, error: null });
    Object.assign(countQuery, { eq: (key: string, value: unknown) => { countFilters(key, value); return countQuery; } });
    const select = vi.fn();
    mocks.client.mockResolvedValue({
      from: (table: string) => {
        const query = Promise.resolve({ data: table === "offers" ? displayedOffers : [], error: null });
        return Object.assign(query, {
          select: (columns: string, options?: { count?: string; head?: boolean }) => {
            select(table, columns, options);
            return options?.head ? countQuery : query;
          },
          eq: () => query,
          in: () => query,
          order: () => query,
          maybeSingle: () => Promise.resolve({ data: { ...products[0], id: productId }, error: null }),
        });
      },
    });
    return { select, countFilters };
  }

  it("uses the exact count when 1,000 inactive displayed offers precede an active offer", async () => {
    const { select, countFilters } = detailDatabase(1);
    const detail = await getAdminProduct(productId);
    expect(detail?.offers).toHaveLength(1000);
    expect(detail?.offers.every((offer) => !offer.isActive)).toBe(true);
    expect(detail?.activeOfferCount).toBe(1);
    expect(select).toHaveBeenCalledWith("offers", "id", { count: "exact", head: true });
    expect(countFilters.mock.calls).toEqual([["product_id", productId], ["is_active", true]]);
  });

  it("does not turn an unavailable exact count into a false zero-offer warning", async () => {
    detailDatabase(null);
    await expect(getAdminProduct(productId)).rejects.toThrow("Counting active offers failed");
  });
});
