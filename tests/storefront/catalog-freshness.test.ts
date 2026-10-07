import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkOffersFreshness,
  clearAvailabilityCache,
  FRESH_STALE_MS,
  FRESH_TTL_MS,
  refreshAvailabilityForActiveOffers,
} from "../../storefront/app/.server/lib/services/catalog-freshness.service";

/**
 * The read path never blocks a sale, never invents stock, and never hides a
 * provider failure. These tests pin those three properties.
 */

type Table = "offers" | "provider_offer_mappings" | "provider_game_mappings" | "stock_items" | "store_settings";

type Fixture = {
  offers?: Record<string, { delivery_kind: string | null; product_id: string | null }>;
  mappings?: Record<string, Record<string, unknown>>;
  gameCodes?: Record<string, string>;
  stocked?: string[];
  providers?: Record<string, unknown>;
  errors?: Partial<Record<Table, { message: string }>>;
};

function fakeClient(fixture: Fixture) {
  class Query {
    private table: Table;
    private filters: { column: string; value: unknown }[] = [];
    constructor(table: Table) {
      this.table = table;
    }
    select() { return this; }
    in(column: string, value: unknown[]) {
      this.filters.push({ column, value });
      return this;
    }
    eq(column: string, value: unknown) {
      this.filters.push({ column, value });
      return this;
    }
    limit() { return this; }
    order() { return this; }
    maybeSingle() {
      return Promise.resolve(this.resolve(true));
    }
    then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve(this.resolve(false)).then(resolve, reject);
    }
    private ids(): string[] {
      const filter = this.filters.find((entry) => entry.column === "offer_id" || entry.column === "id");
      return Array.isArray(filter?.value) ? (filter!.value as string[]) : [];
    }
    private resolve(single: boolean): { data: unknown; error: unknown } {
      const error = fixture.errors?.[this.table];
      if (error) return { data: null, error };
      switch (this.table) {
        case "offers": {
          const rows = this.ids().flatMap((id) => {
            const row = fixture.offers?.[id];
            return row ? [{ id, is_active: true, ...row }] : [];
          });
          return { data: single ? (rows[0] ?? null) : rows, error: null };
        }
        case "provider_offer_mappings": {
          const rows = this.ids().flatMap((id) => {
            const row = fixture.mappings?.[id];
            return row ? [{ offer_id: id, ...row }] : [];
          });
          return { data: rows, error: null };
        }
        case "provider_game_mappings": {
          const rows = Object.entries(fixture.gameCodes ?? {}).map(([game_id, external_game_code]) => ({
            game_id,
            provider_name: "g2bulk",
            external_game_code,
          }));
          return { data: rows, error: null };
        }
        case "stock_items": {
          return { data: (fixture.stocked ?? []).map((offer_id) => ({ offer_id })), error: null };
        }
        case "store_settings": {
          return { data: { providers: fixture.providers ?? {} }, error: null };
        }
      }
    }
  }

  return { from: (table: string) => new Query(table as Table) } as never;
}

/** The service client reads the same fixture as the public client. */
function serviceFor(fixture: Fixture) {
  return fakeClient(fixture);
}

function g2bulkCatalogue(items: { id: number; name: string; amount: number }[]) {
  return () =>
    Promise.resolve(new Response(JSON.stringify({
      success: true,
      game: { code: "mlbb", name: "Mobile Legends", image_url: null },
      catalogues: items,
    }), { headers: { "content-type": "application/json" } }));
}

beforeEach(() => clearAvailabilityCache());
afterEach(() => vi.unstubAllGlobals());

describe("read-path availability", () => {
  const baseFixture: Fixture = {
    offers: { "offer-55": { delivery_kind: "account", product_id: "p-mlbb" } },
    mappings: {
      "offer-55": { provider_name: "g2bulk", external_product_id: null, supplier_cost_usd: 0.5, metadata: { catalogue_id: 820 } },
    },
    gameCodes: { "p-mlbb": "mlbb" },
    providers: { g2bulk: { api_key: "test-key", enabled: true } },
  };

  it("marks an offer available when the supplier still lists its catalogue item", async () => {
    vi.stubGlobal("fetch", vi.fn(g2bulkCatalogue([{ id: 820, name: "55", amount: 55 }])));
    const result = await checkOffersFreshness(fakeClient(baseFixture), [{ id: "offer-55" }], { serviceClient: serviceFor(baseFixture) });
    expect(result.get("offer-55")).toMatchObject({
      status: "available",
      source: "catalogue-listing",
      stale: false,
      priceChanged: false,
    });
  });

  it("marks an offer unavailable when the supplier dropped it, without changing the catalog", async () => {
    vi.stubGlobal("fetch", vi.fn(g2bulkCatalogue([{ id: 999, name: "other", amount: 1 }])));
    const result = await checkOffersFreshness(fakeClient(baseFixture), [{ id: "offer-55" }], { serviceClient: serviceFor(baseFixture) });
    expect(result.get("offer-55")?.status).toBe("unavailable");
  });

  it("reports a provider failure as unknown, never as available", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("upstream down", { status: 503 })));
    const result = await checkOffersFreshness(fakeClient(baseFixture), [{ id: "offer-55" }], { serviceClient: serviceFor(baseFixture) });
    const entry = result.get("offer-55")!;
    expect(entry.status).toBe("unknown");
    expect(entry.source).toBe("provider-unreachable");
  });

  it("reports unknown when a database read of the mappings fails", async () => {
    vi.stubGlobal("fetch", vi.fn(g2bulkCatalogue([{ id: 820, name: "55", amount: 55 }])));
    const fixture: Fixture = { ...baseFixture, errors: { provider_offer_mappings: { message: "boom" } } };
    const result = await checkOffersFreshness(fakeClient(fixture), [{ id: "offer-55" }], { serviceClient: serviceFor(baseFixture) });
    expect(result.get("offer-55")?.status).toBe("unknown");
  });

  it("serves a second read inside the TTL from cache without calling the supplier again", async () => {
    const fetchMock = vi.fn(g2bulkCatalogue([{ id: 820, name: "55", amount: 55 }]));
    vi.stubGlobal("fetch", fetchMock);
    const client = fakeClient(baseFixture);
    await checkOffersFreshness(client, [{ id: "offer-55" }], { serviceClient: serviceFor(baseFixture) });
    await checkOffersFreshness(client, [{ id: "offer-55" }], { serviceClient: serviceFor(baseFixture) });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("hands back the stale answer immediately and refreshes in the background", async () => {
    const fetchMock = vi.fn(g2bulkCatalogue([{ id: 820, name: "55", amount: 55 }]));
    vi.stubGlobal("fetch", fetchMock);
    const client = fakeClient(baseFixture);
    await checkOffersFreshness(client, [{ id: "offer-55" }], { serviceClient: serviceFor(baseFixture) });

    // Age the snapshot past its TTL but inside the stale window.
    vi.setSystemTime(Date.now() + FRESH_TTL_MS + 1_000);
    const scheduled: Promise<unknown>[] = [];
    const staleResult = await checkOffersFreshness(client, [{ id: "offer-55" }], {
      serviceClient: serviceFor(baseFixture),
      schedule: (promise) => scheduled.push(promise),
    });
    expect(staleResult.get("offer-55")?.status).toBe("available");
    expect(staleResult.get("offer-55")?.stale).toBe(true);
    // The refresh was handed to the route's waitUntil instead of blocking.
    expect(scheduled).toHaveLength(1);
    await Promise.all(scheduled);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("treats stock in our own inventory as available without a supplier call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const fixture: Fixture = {
      offers: { "offer-code": { delivery_kind: "stored", product_id: null } },
      stocked: ["offer-code"],
    };
    const result = await checkOffersFreshness(fakeClient(fixture), [{ id: "offer-code" }], { serviceClient: serviceFor(fixture) });
    expect(result.get("offer-code")).toMatchObject({ status: "available", source: "stored-stock" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the live product stock count and flags a moved supplier price", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      products: [{ id: 1056, title: "Riot Cash", unit_price: 6.0, stock: 4 }],
    }), { headers: { "content-type": "application/json" } })));
    const fixture: Fixture = {
      offers: { "offer-riot": { delivery_kind: "account", product_id: "p-riot" } },
      mappings: {
        "offer-riot": { provider_name: "g2bulk", external_product_id: "1056", supplier_cost_usd: 5.06, metadata: { product_id: 1056 } },
      },
      gameCodes: {},
    };
    const result = await checkOffersFreshness(fakeClient(fixture), [{ id: "offer-riot" }], { serviceClient: serviceFor(baseFixture) });
    expect(result.get("offer-riot")).toMatchObject({
      status: "available",
      source: "supplier-stock",
      priceChanged: true,
    });
  });

  it("reports zero supplier stock as unavailable and never as available", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      products: [{ id: 1056, title: "Riot Cash", unit_price: 5.06, stock: 0 }],
    }), { headers: { "content-type": "application/json" } })));
    const fixture: Fixture = {
      offers: { "offer-riot": { delivery_kind: "account", product_id: "p-riot" } },
      mappings: {
        "offer-riot": { provider_name: "g2bulk", external_product_id: "1056", supplier_cost_usd: 5.06, metadata: { product_id: 1056 } },
      },
      gameCodes: {},
    };
    const result = await checkOffersFreshness(fakeClient(fixture), [{ id: "offer-riot" }], { serviceClient: serviceFor(baseFixture) });
    expect(result.get("offer-riot")?.status).toBe("unavailable");
  });

  it("leaves an offer from another provider unclaimed rather than guessing", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const fixture: Fixture = {
      offers: { "offer-bat": { delivery_kind: "account", product_id: "p-bat" } },
      mappings: { "offer-bat": { provider_name: "batstore", external_product_id: "12", supplier_cost_usd: 1, metadata: {} } },
    };
    const result = await checkOffersFreshness(fakeClient(fixture), [{ id: "offer-bat" }], { serviceClient: serviceFor(baseFixture) });
    expect(result.get("offer-bat")).toMatchObject({ status: "unknown", source: "not-checked" });
  });
});

describe("scheduled refresh hook", () => {
  it("refreshes the game codes of active products and reports what it read", async () => {
    const fetchMock = vi.fn(g2bulkCatalogue([{ id: 820, name: "55", amount: 55 }]));
    vi.stubGlobal("fetch", fetchMock);
    const result = await refreshAvailabilityForActiveOffers(
      fakeClient({ gameCodes: { "p-mlbb": "mlbb" } }),
      {
        maxGameCodes: 5,
        serviceClient: serviceFor({ providers: { g2bulk: { api_key: "test-key", enabled: true } } }),
      },
    );
    expect(result.gameCodes).toEqual(["mlbb"]);
    expect(result.refreshed).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does nothing, and claims nothing, without a configured key", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await refreshAvailabilityForActiveOffers(fakeClient({ providers: {} }), { serviceClient: serviceFor({ providers: {} }) });
    expect(result).toEqual({ gameCodes: [], refreshed: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the stale window bounded so a stale snapshot is never served forever", () => {
    expect(FRESH_TTL_MS).toBeGreaterThan(0);
    expect(FRESH_STALE_MS).toBeGreaterThan(FRESH_TTL_MS);
    expect(FRESH_STALE_MS).toBeLessThanOrEqual(15 * 60_000);
  });
});
