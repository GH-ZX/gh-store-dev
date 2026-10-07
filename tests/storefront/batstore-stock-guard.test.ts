import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@server/types/database";

/**
 * The BatStore checkout preflight — the guard of last resort.
 *
 * This is the exact regression the two live failed orders prove: a customer was
 * charged, then BatStore answered `Insufficient stock for product #16 (requested
 * 1, available 0)`. Parking a zero-stock offer hides it, but a snapshot can be
 * stale and an administrator can override it, so the money path asks the
 * supplier itself and refuses to charge when the answer is no.
 */

const supplier = vi.hoisted(() => ({
  listProducts: vi.fn(),
  alerts: [] as { type: string; payload: Json; dedupKey?: string }[],
}));

vi.mock("@server/providers/batstore/client", () => ({
  BatStoreClient: class {
    listProducts() {
      return supplier.listProducts();
    }
  },
}));

vi.mock("@server/lib/services/telegram-alerts.service", () => ({
  enqueueTelegramAlert: vi.fn(async (input: { type: string; payload: Json; dedupKey?: string }) => {
    supplier.alerts.push(input);
  }),
}));

import {
  checkBatStoreStockBeforeCharge,
  resetBatStoreStockCache,
  toStockLevel,
} from "@server/lib/services/batstore-stock.service";

const OFFER = "6a032ac5-4710-4360-bcd5-d7d3a0917348";
const OTHER_OFFER = "510f7336-7e48-4e09-b606-74fd87dc9e6c";

function product(id: string, stock: number | null, isTest = false) {
  return {
    id,
    name: `Product ${id}`,
    description: null,
    emoji: null,
    imageUrl: null,
    priceUsd: 1,
    standardPriceUsd: null,
    pricingType: null,
    deliveryType: "stock",
    stock,
    isTest,
  };
}

const settingsWithKey = {
  data: { providers: { batstore: { api_token: "test-token", enabled: true } } },
  error: null,
};

type Plan = {
  mapping?: { data: { external_product_id: string | null; metadata: Json } | null; error: { message: string } | null };
  settings?: { data: unknown; error: { message: string } | null };
};

/**
 * A minimal PostgREST stand-in for the two reads the guard makes. The mapping
 * read resolves via `.maybeSingle()`; the settings read materializes on await.
 */
function createFakeSupabase(plan: Plan): { client: SupabaseClient<Database>; queries: string[] } {
  const queries: string[] = [];

  const client = {
    from(table: string) {
      queries.push(table);
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: () => {
          if (table === "provider_offer_mappings") {
            return Promise.resolve(plan.mapping ?? { data: null, error: null });
          }

          return Promise.resolve(plan.settings ?? { data: null, error: null });
        },
        then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
          Promise.resolve(plan.settings ?? { data: null, error: null }).then(onFulfilled, onRejected),
      };

      return query;
    },
  } as unknown as SupabaseClient<Database>;

  return { client, queries };
}

beforeEach(() => {
  resetBatStoreStockCache();
  supplier.listProducts.mockReset();
  supplier.alerts = [];
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("toStockLevel", () => {
  it("treats a positive count as stock and zero as none", () => {
    expect(toStockLevel({ stock: 3, isTest: false })).toMatchObject({ available: true, stock: 3 });
    expect(toStockLevel({ stock: 0, isTest: false })).toMatchObject({ available: false, stock: 0 });
  });

  it("treats a missing count as no stock, not as unlimited", () => {
    expect(toStockLevel({ stock: null, isTest: false })).toMatchObject({ available: false, stock: null });
  });

  it("never treats a BatStore test product as sellable", () => {
    expect(toStockLevel({ stock: 999999, isTest: true }).available).toBe(false);
  });
});

describe("checkBatStoreStockBeforeCharge", () => {
  it("refuses the charge when the supplier has zero stock", async () => {
    supplier.listProducts.mockResolvedValue([product("16", 0)]);
    const { client } = createFakeSupabase({
      mapping: { data: { external_product_id: "16", metadata: {} }, error: null },
      settings: settingsWithKey,
    });

    const result = await checkBatStoreStockBeforeCharge(client, OFFER, 1);

    expect(result).toMatchObject({ ok: false, batstore: true, reason: "out_of_stock", available: 0 });
  });

  it("refuses without spending a supplier call when the last snapshot already said zero", async () => {
    const { client } = createFakeSupabase({
      mapping: {
        data: {
          external_product_id: "16",
          metadata: { stock: 0, availability_status: "out_of_stock", parked_by_stock_sync: true },
        },
        error: null,
      },
      settings: settingsWithKey,
    });

    const result = await checkBatStoreStockBeforeCharge(client, OFFER, 1);

    expect(result).toMatchObject({ ok: false, reason: "out_of_stock" });
    expect(supplier.listProducts).not.toHaveBeenCalled();
  });

  it("refuses when the supplier has less than the requested quantity", async () => {
    supplier.listProducts.mockResolvedValue([product("16", 1)]);
    const { client } = createFakeSupabase({
      mapping: { data: { external_product_id: "16", metadata: {} }, error: null },
      settings: settingsWithKey,
    });

    const result = await checkBatStoreStockBeforeCharge(client, OFFER, 3);

    expect(result).toMatchObject({ ok: false, reason: "out_of_stock", available: 1 });
  });

  it("refuses when BatStore no longer lists the product at all", async () => {
    // Live case: product #83 is mapped here and absent from BatStore's product
    // list, which is why one of the two failed orders could be charged at all.
    supplier.listProducts.mockResolvedValue([product("16", 50)]);
    const { client } = createFakeSupabase({
      mapping: { data: { external_product_id: "83", metadata: {} }, error: null },
      settings: settingsWithKey,
    });

    const result = await checkBatStoreStockBeforeCharge(client, OTHER_OFFER, 1, {
      now: Date.parse("2026-10-10T12:00:00Z"),
    });

    expect(result).toMatchObject({ ok: false, reason: "out_of_stock", available: 0, productId: "83" });
    expect(supplier.alerts[0].payload).toMatchObject({ reason: "delisted", product_id: "83" });
  });

  it("refuses a zero-stock offer whose snapshot says it is no longer listed", async () => {
    // The sweep deliberately leaves a delisted mapping's offer active — the
    // supplier's listing moved, which is an operator decision — so the guard is
    // the only thing standing between that offer and a refund cycle.
    const { client } = createFakeSupabase({
      mapping: {
        data: {
          external_product_id: "83",
          metadata: { stock: null, availability_status: "not_listed" },
        },
        error: null,
      },
      settings: settingsWithKey,
    });

    const result = await checkBatStoreStockBeforeCharge(client, OTHER_OFFER, 1);

    expect(result).toMatchObject({ ok: false, reason: "out_of_stock", available: 0 });
  });

  it("allows the charge when the supplier has enough", async () => {
    supplier.listProducts.mockResolvedValue([product("83", 12)]);
    const { client } = createFakeSupabase({
      mapping: { data: { external_product_id: "83", metadata: {} }, error: null },
      settings: settingsWithKey,
    });

    const result = await checkBatStoreStockBeforeCharge(client, OTHER_OFFER, 1);

    expect(result).toMatchObject({ ok: true, batstore: true, productId: "83", available: 12 });
  });

  it("fails closed when the supplier cannot be reached", async () => {
    supplier.listProducts.mockRejectedValue(new Error("network down"));
    const { client } = createFakeSupabase({
      mapping: { data: { external_product_id: "16", metadata: {} }, error: null },
      settings: settingsWithKey,
    });

    const result = await checkBatStoreStockBeforeCharge(client, OFFER, 1);

    expect(result).toMatchObject({ ok: false, reason: "supplier_unavailable" });
  });

  it("fails closed when BatStore is not configured", async () => {
    const { client } = createFakeSupabase({
      mapping: { data: { external_product_id: "16", metadata: {} }, error: null },
      settings: { data: { providers: { batstore: { enabled: false } } }, error: null },
    });

    const result = await checkBatStoreStockBeforeCharge(client, OFFER, 1);

    expect(result).toMatchObject({ ok: false, reason: "supplier_unavailable" });
  });

  it("fails closed when the mapping cannot be read, and never throws", async () => {
    const { client } = createFakeSupabase({
      mapping: { data: null, error: { message: "connection reset" } },
    });

    await expect(checkBatStoreStockBeforeCharge(client, OFFER, 1)).resolves.toMatchObject({
      ok: false,
      reason: "supplier_unavailable",
    });
  });

  it("is a no-op for an offer that is not mapped to BatStore", async () => {
    const { client } = createFakeSupabase({ mapping: { data: null, error: null } });

    const result = await checkBatStoreStockBeforeCharge(client, OTHER_OFFER, 1);

    expect(result).toEqual({ ok: true, batstore: false });
    // Another supplier owns this offer; the BatStore key must not even be read.
    expect(supplier.listProducts).not.toHaveBeenCalled();
  });

  it("alerts the owner with a deduplicated low_stock alert when it refuses", async () => {
    supplier.listProducts.mockResolvedValue([product("16", 0)]);
    const { client } = createFakeSupabase({
      mapping: { data: { external_product_id: "16", metadata: {} }, error: null },
      settings: settingsWithKey,
    });

    await checkBatStoreStockBeforeCharge(client, OFFER, 1, { now: Date.parse("2026-10-10T12:00:00Z") });

    expect(supplier.alerts).toHaveLength(1);
    expect(supplier.alerts[0]).toMatchObject({
      type: "low_stock",
      payload: { provider: "batstore", offer_id: OFFER, product_id: "16", remaining: 0, requested: 1 },
    });
    expect(supplier.alerts[0].dedupKey).toContain("low_stock:batstore:16:");
  });

  it("caches the supplier read so a burst of checkouts costs one call", async () => {
    supplier.listProducts.mockResolvedValue([product("16", 5)]);
    const { client } = createFakeSupabase({
      mapping: { data: { external_product_id: "16", metadata: {} }, error: null },
      settings: settingsWithKey,
    });

    await checkBatStoreStockBeforeCharge(client, OFFER, 1);
    await checkBatStoreStockBeforeCharge(client, OFFER, 1);

    expect(supplier.listProducts).toHaveBeenCalledTimes(1);
  });
});
