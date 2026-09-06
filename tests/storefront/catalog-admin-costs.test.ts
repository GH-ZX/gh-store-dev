import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StoreOffer } from "@/lib/catalog/offer-mapper";

const mocks = vi.hoisted(() => ({ createServerClient: vi.fn(), reads: [] as { user: string | undefined; table: string }[] }));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.createServerClient }));
import { withRequestContext } from "@server/request-context";
import { withAdminOfferCosts } from "@server/lib/services/catalog-admin-costs.service";
import { isPublicHtmlRequest } from "../../storefront/workers/request-policy";

const env = { SUPABASE_URL: "https://unit-test.supabase.co", SUPABASE_PUBLISHABLE_KEY: "public-key" };
const publicOffers = [{ id: "offer-a", name: "Public offer", price: 10 }] as StoreOffer[];

beforeEach(() => {
  mocks.reads.length = 0;
  mocks.createServerClient.mockImplementation((_url: string, _key: string, options: { cookies: { getAll(): { name: string; value: string }[] } }) => {
    const user = options.cookies.getAll().find((cookie) => cookie.name === "session")?.value;
    return {
      auth: { getClaims: vi.fn(async () => ({ data: { claims: user ? { sub: user } : {} }, error: null })) },
      from(table: string) {
        mocks.reads.push({ user, table });
        const chain = {
          select() { return chain; },
          in() { return chain; },
          eq() { return chain; },
          maybeSingle: async () => ({ data: { role: user?.startsWith("admin") ? "admin" : "customer", is_active: user !== "admin-disabled" }, error: null }),
          then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ data: [{ offer_id: "offer-a", supplier_cost_usd: user === "admin-b" ? 4 : 3 }], error: user === "admin-denied" ? { message: "RLS denied" } : null })),
        };
        return chain;
      },
    };
  });
});

async function load(user: string | null, offers = publicOffers) {
  const request = new Request("https://store.example/en/ai/product", { headers: { accept: "text/html", ...(user ? { cookie: `session=${user}` } : {}) } });
  const response = await withRequestContext(request, env, async () => Response.json(await withAdminOfferCosts(offers)));
  return { request, offers: await response.json() as StoreOffer[] };
}

describe("administrator-only supplier cost annotations", () => {
  it("never queries costs for visitors, customers, or inactive administrators", async () => {
    const contaminated = [{ ...publicOffers[0], supplierCostUsd: 99 }];
    for (const user of [null, "customer", "admin-disabled"]) {
      const result = await load(user, contaminated);
      expect(result.offers[0]).not.toHaveProperty("supplierCostUsd");
    }
    expect(mocks.reads.filter((read) => read.table === "provider_offer_mappings")).toEqual([]);
    expect(mocks.reads.filter((read) => read.user === undefined)).toEqual([]);
  });

  it("uses each administrator's own RLS session and leaves shared public offers unchanged", async () => {
    const [first, second, visitor] = await Promise.all([load("admin-a"), load("admin-b"), load(null)]);
    expect(first.offers[0].supplierCostUsd).toBe(3);
    expect(second.offers[0].supplierCostUsd).toBe(4);
    expect(visitor.offers[0]).not.toHaveProperty("supplierCostUsd");
    expect(publicOffers[0]).not.toHaveProperty("supplierCostUsd");
    expect(mocks.reads.filter((read) => read.table === "provider_offer_mappings").map((read) => read.user).sort()).toEqual(["admin-a", "admin-b"]);
    expect(isPublicHtmlRequest(first.request)).toBe(false);
    expect(isPublicHtmlRequest(second.request)).toBe(false);
    expect(isPublicHtmlRequest(visitor.request)).toBe(true);
  });

  it("fails closed on mapping denial and still returns public offer information", async () => {
    const result = await load("admin-denied");
    expect(result.offers).toEqual(publicOffers);
    expect(result.offers[0]).not.toHaveProperty("supplierCostUsd");
  });
});
