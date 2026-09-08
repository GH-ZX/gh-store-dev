import { beforeEach, describe, expect, it, vi } from "vitest";

type Query = { table: string; selected?: string; update?: Record<string, unknown>; filters: [string, unknown][] };
const mocks = vi.hoisted(() => ({
  admin: vi.fn(), client: vi.fn(), queries: [] as Query[],
  mappings: [] as { offer_id: string; provider_name: string; supplier_cost_usd: number; pricing_mode: string }[],
}));
vi.mock("@server/lib/auth/guards", () => ({ requireAdmin: mocks.admin }));
vi.mock("@server/lib/supabase/server", () => ({ createSupabaseServerClient: mocks.client }));
vi.mock("@server/legacy/lib/services/admin-audit.service", () => ({ recordAudit: vi.fn() }));
import { getAdminProduct, updateAdminOffers, type AdminOfferUpdate } from "@server/legacy/lib/services/admin-catalog.service";

const productId = "11111111-1111-4111-8111-111111111111";
const offerId = "22222222-2222-4222-8222-222222222222";
const update: AdminOfferUpdate = { id: offerId, nameAr: "باقة", nameEn: "Offer", descriptionAr: null, descriptionEn: null, price: 12, originalPrice: 15, isSale: true, isActive: true, sortOrder: 1, pricingMode: "fixed" };

beforeEach(() => {
  vi.clearAllMocks(); mocks.queries.length = 0;
  mocks.mappings = [{ offer_id: offerId, provider_name: "maxstore", supplier_cost_usd: 5, pricing_mode: "fixed" }];
  mocks.client.mockResolvedValue({ from(table: string) {
    const query: Query = { table, filters: [] }; mocks.queries.push(query);
    function result() {
      if (query.update) return { data: null, error: null };
      if (table === "products") return { data: { id: productId, slug: "product", name_ar: "منتج", name_en: "Product", product_kind: "digital" }, error: null };
      if (table === "provider_offer_mappings") return { data: mocks.mappings, error: null };
      if (table === "provider_game_mappings") return { data: [], error: null };
      return { data: query.selected === "id" ? [{ id: offerId }] : [{ id: offerId, price: 12, original_price: 15, currency: "USD", provider_offer_mappings: mocks.mappings }], error: null, count: 1 };
    }
    const chain = {
      select(value: string) { query.selected = value; return chain; },
      update(value: Record<string, unknown>) { query.update = value; return chain; },
      eq(key: string, value: unknown) { query.filters.push([key, value]); return chain; },
      in(key: string, value: unknown) { query.filters.push([key, value]); return chain; },
      order() { return chain; },
      maybeSingle: async () => result(),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve(result())),
    };
    return chain;
  } });
});

describe("admin supplier pricing modes", () => {
  it.each(["g2bulk", "maxstore", "batstore"])("reads %s supplier cost and custom/fixed policy", async (provider_name) => {
    for (const pricing_mode of ["custom", "fixed"]) {
      mocks.mappings = [{ offer_id: offerId, provider_name, supplier_cost_usd: 5, pricing_mode }];
      expect((await getAdminProduct(productId))?.offers[0]).toMatchObject({ supplierCostUsd: 5, pricingMode: pricing_mode, price: 12 });
    }
  });
  it.each(["g2bulk", "maxstore", "batstore"])("saves each supported pricing mode to the actual %s mapping", async (provider_name) => {
    for (const pricingMode of ["default", "custom", "fixed"] as const) {
      mocks.queries.length = 0;
      mocks.mappings = [{ offer_id: offerId, provider_name, supplier_cost_usd: 5, pricing_mode: "default" }];
      await updateAdminOffers(productId, [{ ...update, pricingMode }]);
      const writes = mocks.queries.filter((query) => query.update);
      expect(writes).toHaveLength(2);
      expect(writes[0]).toMatchObject({ table: "offers", update: { price: 12, original_price: 15, is_sale: true } });
      expect(writes[0].filters).toEqual([["id", offerId], ["product_id", productId]]);
      expect(writes[1]).toMatchObject({ table: "provider_offer_mappings", update: { pricing_mode: pricingMode } });
      expect(writes[1].filters).toEqual([["offer_id", offerId], ["provider_name", provider_name]]);
      expect(writes[1].update).not.toHaveProperty("supplier_cost_usd");
    }
  });
  it("does not write a supplier policy for manually created offers", async () => {
    mocks.mappings = [];
    await updateAdminOffers(productId, [update]);
    expect(mocks.queries.filter((query) => query.update).map((query) => query.table)).toEqual(["offers"]);
  });
  it("refuses conflicting supplier mappings before changing any prices", async () => {
    mocks.mappings.push({ ...mocks.mappings[0], provider_name: "batstore" });
    await expect(updateAdminOffers(productId, [update])).rejects.toThrow("multiple supplier mappings");
    expect(mocks.queries.filter((query) => query.update)).toEqual([]);
  });
  it("does not update an offer owned by a different product", async () => {
    await updateAdminOffers(productId, [{ ...update, id: "33333333-3333-4333-8333-333333333333" }]);
    expect(mocks.queries.filter((query) => query.update)).toEqual([]);
  });
  it("authorizes the administrator before accessing pricing data", async () => {
    mocks.admin.mockRejectedValue(new Error("Forbidden"));
    await expect(updateAdminOffers(productId, [update])).rejects.toThrow("Forbidden");
    expect(mocks.client).not.toHaveBeenCalled();
  });
});
