import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@server/types/database";

/**
 * The BatStore stock sweep, tested against a fake database and a fake supplier.
 *
 * The regression these cover is a live one: two paid orders were charged and
 * then answered `Insufficient stock for product #16 (requested 1, available 0)`
 * because nothing refreshed supplier stock automatically and the offer stayed
 * `is_active = true` through the supplier running dry.
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

import { resetBatStoreStockCache } from "@server/lib/services/batstore-stock.service";
import {
  DEFAULT_STOCK_SYNC_BATCH,
  DEFAULT_STOCK_SYNC_THROTTLE_MS,
  nextParkedFlag,
  nextStockMetadata,
  planStockAction,
  runBatStoreStockSyncScheduled,
  syncBatStoreStock,
  type StockDecision,
} from "@server/lib/services/batstore-stock-sync.service";

const NOW = Date.parse("2026-10-10T12:00:00Z");
const PROVIDER = "batstore";

const OFFER_WITH_STOCK = "11111111-1111-4111-8111-111111111111";
const OFFER_OUT_OF_STOCK = "22222222-2222-4222-8222-222222222222";
const OFFER_PARKED = "33333333-3333-4333-8333-333333333333";
const OFFER_MANUAL = "44444444-4444-4444-8444-444444444444";

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

interface Query {
  filters: Record<string, unknown>;
  operation: "select" | "insert" | "update";
  limit: number | null;
  payload: unknown;
}

type Plan = Record<string, (query: Query) => { data: unknown; error: { message: string } | null }>;

/**
 * A minimal PostgREST stand-in: every builder method records itself, and the
 * result materializes when the query is awaited or `.maybeSingle()` is called.
 * Writes are collected so a test can assert on the exact columns touched.
 */
function createFakeSupabase(plan: Plan): { client: SupabaseClient<Database>; writes: Query[] } {
  const writes: Query[] = [];

  const record = (query: Query) => {
    if (query.operation !== "select") {
      writes.push(query);
    }
  };

  const client = {
    from(table: string) {
      const query: Query = { filters: {}, operation: "select", limit: null, payload: undefined };
      const resolver = (): { data: unknown; error: { message: string } | null } => {
        record(query);

        const planned = plan[table];

        return planned ? planned(query) : { data: null, error: null };
      };
      const builder: Record<string, unknown> = {};

      builder.select = () => builder;
      builder.insert = (payload: unknown) => {
        query.operation = "insert";
        query.payload = payload;

        return builder;
      };
      builder.update = (payload: unknown) => {
        query.operation = "update";
        query.payload = payload;

        return builder;
      };
      builder.delete = () => {
        query.operation = "update";

        return builder;
      };
      builder.eq = (column: string, value: unknown) => {
        query.filters[column] = value;

        return builder;
      };
      builder.gt = (column: string, value: unknown) => {
        query.filters[`gt:${column}`] = value;

        return builder;
      };
      builder.not = (column: string, operator: string, value: unknown) => {
        query.filters[`not:${column}:${operator}`] = value;

        return builder;
      };
      for (const method of ["in", "order", "is"]) {
        builder[method] = () => builder;
      }
      builder.limit = (value: number) => {
        query.limit = value;

        return builder;
      };
      builder.maybeSingle = () => Promise.resolve(resolver());
      builder.single = () => Promise.resolve(resolver());
      builder.then = (
        onFulfilled: (value: unknown) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) => Promise.resolve(resolver()).then(onFulfilled, onRejected);

      return builder;
    },
  } as unknown as SupabaseClient<Database>;

  return { client, writes };
}

/** The settings row each run reads for the BatStore key. */
const settingsWithKey = {
  data: { providers: { batstore: { api_token: "test-token", enabled: true } } },
  error: null,
};

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
  vi.unstubAllGlobals();
});

describe("planStockAction", () => {
  const decision = (over: Partial<StockDecision> = {}): StockDecision => ({
    offerId: OFFER_WITH_STOCK,
    productId: "16",
    level: { stock: 5, available: true, isTest: false },
    wasActive: true,
    wasParkedByStockSync: false,
    adminOverrodeStock: false,
    ...over,
  });

  it("parks an active offer the supplier has run out of", () => {
    expect(
      planStockAction(decision({ level: { stock: 0, available: false, isTest: false } })),
    ).toBe("park");
  });

  it("parks an active offer when the supplier reports no stock number at all", () => {
    expect(
      planStockAction(decision({ level: { stock: null, available: false, isTest: false } })),
    ).toBe("park");
  });

  it("parks an active BatStore test product", () => {
    expect(
      planStockAction(decision({ level: { stock: 999999, available: false, isTest: true } })),
    ).toBe("park");
  });

  it("unparks an offer this sweep parked once stock returns", () => {
    expect(planStockAction(decision({ wasActive: false, wasParkedByStockSync: true }))).toBe("unpark");
  });

  it("leaves alone an out-of-stock offer an administrator re-activated", () => {
    // The admin override is absolute for the rest of the depletion: the sweep
    // must not park it again behind the owner's back.
    expect(
      planStockAction(
        decision({
          level: { stock: 0, available: false, isTest: false },
          adminOverrodeStock: true,
        }),
      ),
    ).toBe("skip");
  });

  it("leaves an administrator's restocked offer alone too", () => {
    expect(
      planStockAction(
        decision({
          level: { stock: 9, available: true, isTest: false },
          wasActive: false,
          adminOverrodeStock: true,
        }),
      ),
    ).toBe("skip");
  });

  it("never touches an offer the supplier no longer lists", () => {
    expect(planStockAction(decision({ level: null, wasActive: false }))).toBe("skip");
  });

  it("never unparks an offer that an administrator switched off", () => {
    expect(planStockAction(decision({ wasActive: false, wasParkedByStockSync: false }))).toBe("skip");
  });
});

describe("nextParkedFlag", () => {
  it("records ownership when the sweep parks an offer", () => {
    expect(nextParkedFlag({ stock: 0, available: false, isTest: false }, "park", false)).toBe(true);
  });

  it("clears ownership when a restock unparks it", () => {
    expect(nextParkedFlag({ stock: 3, available: true, isTest: false }, "unpark", true)).toBe(false);
  });

  it("preserves an administrator's cleared marker", () => {
    expect(nextParkedFlag({ stock: 0, available: false, isTest: false }, "skip", false)).toBe(false);
  });
});

describe("nextStockMetadata", () => {
  it("preserves every key the sweep does not own", () => {
    const next = nextStockMetadata(
      { quantity_max: 4, price_usd: 1.3, parked_by_stock_sync: true } as Json,
      { stock: 0, available: false, isTest: false },
      true,
      "2026-10-10T12:00:00.000Z",
      "16",
    ) as Record<string, Json>;

    expect(next.quantity_max).toBe(4);
    expect(next.price_usd).toBe(1.3);
    expect(next.product_id).toBe("16");
    expect(next.stock).toBe(0);
    expect(next.availability_status).toBe("out_of_stock");
    expect(next.parked_by_stock_sync).toBe(true);
  });

  it("labels a delisted product instead of pretending it is sold out", () => {
    const next = nextStockMetadata(null, null, true, "2026-10-10T12:00:00.000Z", "83") as Record<string, Json>;

    expect(next.availability_status).toBe("not_listed");
  });
});

describe("syncBatStoreStock", () => {
  it("throttles: a second run inside the window does nothing", async () => {
    const { client, writes } = createFakeSupabase({
      provider_sync_state: () => ({
        data: { last_run_at: new Date(NOW - 60_000).toISOString() },
        error: null,
      }),
    });

    const run = await syncBatStoreStock(client, { now: NOW });

    expect(run.ran).toBe(false);
    expect(run.reason).toBe("throttled");
    expect(supplier.listProducts).not.toHaveBeenCalled();
    expect(writes).toHaveLength(0);
  });

  it("still runs when the stored run is exactly one window old", async () => {
    supplier.listProducts.mockResolvedValue([product("16", 3)]);
    const { client } = createFakeSupabase({
      provider_sync_state: () => ({
        data: { last_run_at: new Date(NOW - DEFAULT_STOCK_SYNC_THROTTLE_MS).toISOString() },
        error: null,
      }),
      store_settings: () => settingsWithKey,
      provider_offer_mappings: () => ({ data: [], error: null }),
    });

    const run = await syncBatStoreStock(client, { now: NOW });

    expect(run.ran).toBe(true);
  });

  it("runs when the window has elapsed, and parks the zero-stock offer", async () => {
    supplier.listProducts.mockResolvedValue([product("16", 0), product("83", 12)]);
    const { client, writes } = createFakeSupabase({
      provider_sync_state: () => ({
        data: { last_run_at: new Date(NOW - DEFAULT_STOCK_SYNC_THROTTLE_MS - 1).toISOString() },
        error: null,
      }),
      store_settings: () => settingsWithKey,
      provider_offer_mappings: () => ({
        data: [
          { offer_id: OFFER_OUT_OF_STOCK, external_product_id: "16", metadata: { parked_by_stock_sync: false } },
          { offer_id: OFFER_WITH_STOCK, external_product_id: "83", metadata: { parked_by_stock_sync: false } },
        ],
        error: null,
      }),
      offers: () => ({
        data: [
          { id: OFFER_OUT_OF_STOCK, is_active: true },
          { id: OFFER_WITH_STOCK, is_active: true },
        ],
        error: null,
      }),
    });

    const run = await syncBatStoreStock(client, { now: NOW });

    expect(run).toMatchObject({ ran: true, reason: "ok", scanned: 2, parked: 1, unparked: 0, failed: 0 });

    const parkWrite = writes.find(
      (write) => write.operation === "update" && (write.payload as { is_active?: boolean })?.is_active === false,
    );
    expect(parkWrite).toBeDefined();

    const parkedMapping = writes.find(
      (write) =>
        write.operation === "update" &&
        (write.payload as { metadata?: Record<string, Json> } | undefined)?.metadata?.parked_by_stock_sync === true,
    );
    expect(parkedMapping).toBeDefined();
  });

  it("unparks an offer once BatStore restocks it", async () => {
    supplier.listProducts.mockResolvedValue([product("16", 40)]);
    const { client, writes } = createFakeSupabase({
      provider_sync_state: () => ({ data: { last_run_at: null }, error: null }),
      store_settings: () => settingsWithKey,
      provider_offer_mappings: () => ({
        data: [{ offer_id: OFFER_PARKED, external_product_id: "16", metadata: { parked_by_stock_sync: true } }],
        error: null,
      }),
      offers: () => ({ data: [{ id: OFFER_PARKED, is_active: false }], error: null }),
    });

    const run = await syncBatStoreStock(client, { now: NOW });

    expect(run).toMatchObject({ ran: true, parked: 0, unparked: 1 });

    const offerWrite = writes.find(
      (write) => write.operation === "update" && "is_active" in (write.payload as object),
    );
    expect((offerWrite?.payload as { is_active?: boolean } | undefined)?.is_active).toBe(true);

    const mappingWrite = writes.find(
      (write) =>
        write.operation === "update" &&
        typeof (write.payload as { metadata?: unknown })?.metadata === "object",
    );
    expect((mappingWrite?.payload as { metadata: Record<string, Json> }).metadata.parked_by_stock_sync).toBe(false);
  });

  it("survives an admin manual edit: an offer reactivated by hand is never re-parked", async () => {
    supplier.listProducts.mockResolvedValue([product("16", 0)]);
    const { client, writes } = createFakeSupabase({
      provider_sync_state: () => ({ data: { last_run_at: null }, error: null }),
      store_settings: () => settingsWithKey,
      provider_offer_mappings: () => ({
        data: [
          {
            offer_id: OFFER_MANUAL,
            external_product_id: "16",
            // What the admin catalogue writes when it clears a stock park: the
            // sweep loses ownership, and the override is recorded so the next
            // sweep cannot park the offer again.
            metadata: { parked_by_stock_sync: false, stock_override_at: "2026-10-10T11:00:00.000Z" },
          },
        ],
        error: null,
      }),
      offers: () => ({ data: [{ id: OFFER_MANUAL, is_active: true }], error: null }),
    });

    const run = await syncBatStoreStock(client, { now: NOW });

    expect(run).toMatchObject({ ran: true, parked: 0, unparked: 0, unchanged: 1 });
    expect(writes.some((write) => "is_active" in (write.payload as object))).toBe(false);

    // The override is recorded in the run's own report, so an operator can see
    // that the sweep deliberately stood down rather than silently skipping it.
    // (`provider_sync_state` is filtered out: it also carries a stock_sync kind.)
    const log = writes.find(
      (write) =>
        write.operation === "insert" &&
        (write.payload as { kind?: string; status?: string } | undefined)?.kind === "stock_sync" &&
        (write.payload as { status?: string }).status === "succeeded",
    );
    expect(JSON.stringify((log?.payload as { details?: unknown } | undefined)?.details)).toContain(
      "manual_override",
    );
  });

  it("parks a fresh zero-stock offer that no administrator has touched", async () => {
    // The control for the test above: no `stock_override_at` means the sweep
    // still owns availability, which is the whole point of the sweep.
    supplier.listProducts.mockResolvedValue([product("16", 0)]);
    const { client, writes } = createFakeSupabase({
      provider_sync_state: () => ({ data: { last_run_at: null }, error: null }),
      store_settings: () => settingsWithKey,
      provider_offer_mappings: () => ({
        data: [
          {
            offer_id: OFFER_OUT_OF_STOCK,
            external_product_id: "16",
            metadata: { product_id: "16", price_usd: 0.5 },
          },
        ],
        error: null,
      }),
      offers: () => ({ data: [{ id: OFFER_OUT_OF_STOCK, is_active: true }], error: null }),
    });

    const run = await syncBatStoreStock(client, { now: NOW });

    expect(run).toMatchObject({ ran: true, parked: 1 });
    expect(
      writes.some(
        (write) => write.operation === "update" && (write.payload as { is_active?: boolean }).is_active === false,
      ),
    ).toBe(true);
  });

  it("skips cleanly when BatStore has no key configured", async () => {
    const { client } = createFakeSupabase({
      provider_sync_state: () => ({ data: { last_run_at: null }, error: null }),
      store_settings: () => ({ data: { providers: { batstore: { enabled: false } } }, error: null }),
    });

    const run = await syncBatStoreStock(client, { now: NOW });

    expect(run).toMatchObject({ ran: false, reason: "no_credentials" });
    expect(supplier.listProducts).not.toHaveBeenCalled();
  });

  it("reads a small batch, not the whole supplier catalogue", async () => {
    supplier.listProducts.mockResolvedValue([product("16", 1)]);
    let observedLimit: number | null = null;
    const { client } = createFakeSupabase({
      provider_sync_state: () => ({ data: { last_run_at: null }, error: null }),
      store_settings: () => settingsWithKey,
      provider_offer_mappings: (query) => {
        observedLimit = query.limit;

        return { data: [], error: null };
      },
    });

    await syncBatStoreStock(client, { now: NOW });

    expect(observedLimit).toBe(DEFAULT_STOCK_SYNC_BATCH);
  });

  it("rotates through the catalogue instead of re-reading the same ten mappings", async () => {
    supplier.listProducts.mockResolvedValue([product("16", 5)]);
    const cursor = "55555555-5555-4555-8555-555555555555";
    let readCursor: unknown = null;
    const { client } = createFakeSupabase({
      // The previous run stopped at `cursor`, so this one must resume there.
      provider_sync_state: () => ({
        data: { last_run_at: null, details: { cursor } },
        error: null,
      }),
      store_settings: () => settingsWithKey,
      provider_offer_mappings: (query) => {
        // Ignore the metadata writes this run performs; only the read matters.
        if (query.operation === "select") {
          readCursor = query.filters["gt:offer_id"];
        }

        return {
          data: [{ offer_id: "66666666-6666-4666-8666-666666666666", external_product_id: "16", metadata: {} }],
          error: null,
        };
      },
      offers: () => ({ data: [{ id: "66666666-6666-4666-8666-666666666666", is_active: true }], error: null }),
    });

    const run = await syncBatStoreStock(client, { now: NOW });

    expect(run).toMatchObject({ ran: true, scanned: 1 });
    expect(readCursor).toBe(cursor);
  });

  it("wraps to the start of the rotation when the cursor reaches the end", async () => {
    supplier.listProducts.mockResolvedValue([product("16", 5)]);
    const reads: unknown[] = [];
    const { client, writes } = createFakeSupabase({
      provider_sync_state: () => ({
        data: { last_run_at: null, details: { cursor: "ffffffff-ffff-4fff-8fff-ffffffffffff" } },
        error: null,
      }),
      store_settings: () => settingsWithKey,
      provider_offer_mappings: (query) => {
        // Ignore the metadata writes this run performs; only the reads matter.
        if (query.operation !== "select") {
          return { data: null, error: null };
        }

        reads.push(query.filters["gt:offer_id"]);

        // Past the end of the rotation the filtered read is empty; the wrap read
        // has no cursor filter and returns the first batch again.
        if (query.filters["gt:offer_id"] !== undefined) {
          return { data: [], error: null };
        }

        return {
          data: [{ offer_id: "11111111-1111-4111-8111-111111111111", external_product_id: "16", metadata: {} }],
          error: null,
        };
      },
      offers: () => ({ data: [{ id: OFFER_WITH_STOCK, is_active: true }], error: null }),
    });

    const run = await syncBatStoreStock(client, { now: NOW });

    expect(run).toMatchObject({ ran: true, scanned: 1 });
    expect(reads).toHaveLength(2);

    // The cursor moves back to the start so the next run does not read nothing.
    const throttleWrite = writes.find(
      (write) =>
        (write.payload as { details?: { cursor?: string } } | undefined)?.details?.cursor === OFFER_WITH_STOCK,
    );
    expect(throttleWrite).toBeDefined();
  });

  it("never changes a price or a supplier cost", async () => {
    supplier.listProducts.mockResolvedValue([product("16", 0)]);
    const { client, writes } = createFakeSupabase({
      provider_sync_state: () => ({ data: { last_run_at: null }, error: null }),
      store_settings: () => settingsWithKey,
      provider_offer_mappings: () => ({
        data: [{ offer_id: OFFER_OUT_OF_STOCK, external_product_id: "16", metadata: {} }],
        error: null,
      }),
      offers: () => ({ data: [{ id: OFFER_OUT_OF_STOCK, is_active: true }], error: null }),
    });

    await syncBatStoreStock(client, { now: NOW });

    expect(writes.length).toBeGreaterThan(0);

    for (const write of writes) {
      const payload = write.payload as Record<string, unknown>;
      expect(payload).not.toHaveProperty("price");
      expect(payload).not.toHaveProperty("supplier_cost_usd");
    }
  });

  it("records the run in provider_sync_logs with the stock_sync kind", async () => {
    supplier.listProducts.mockResolvedValue([product("16", 5)]);
    const logWrites: Query[] = [];
    const { client } = createFakeSupabase({
      provider_sync_state: () => ({ data: { last_run_at: null }, error: null }),
      store_settings: () => settingsWithKey,
      provider_offer_mappings: () => ({
        data: [{ offer_id: OFFER_WITH_STOCK, external_product_id: "16", metadata: {} }],
        error: null,
      }),
      offers: () => ({ data: [{ id: OFFER_WITH_STOCK, is_active: true }], error: null }),
      provider_sync_logs: (query) => {
        logWrites.push(query);

        return { data: null, error: null };
      },
    });

    await syncBatStoreStock(client, { now: NOW });

    expect(logWrites.find((write) => write.operation === "insert")?.payload).toMatchObject({
      provider_name: PROVIDER,
      kind: "stock_sync",
      status: "succeeded",
    });
  });

  it("keeps going when one product's update fails", async () => {
    supplier.listProducts.mockResolvedValue([product("16", 0), product("83", 0)]);
    const { client } = createFakeSupabase({
      provider_sync_state: () => ({ data: { last_run_at: null }, error: null }),
      store_settings: () => settingsWithKey,
      provider_offer_mappings: () => ({
        data: [
          { offer_id: OFFER_OUT_OF_STOCK, external_product_id: "16", metadata: {} },
          { offer_id: OFFER_WITH_STOCK, external_product_id: "83", metadata: {} },
        ],
        error: null,
      }),
      offers: (query) => {
        if (query.operation === "update" && query.filters.id === OFFER_OUT_OF_STOCK) {
          return { data: null, error: { message: "write failed" } };
        }

        return {
          data: [
            { id: OFFER_OUT_OF_STOCK, is_active: true },
            { id: OFFER_WITH_STOCK, is_active: true },
          ],
          error: null,
        };
      },
    });

    const run = await syncBatStoreStock(client, { now: NOW });

    // The first offer's write failed, the second still parked, and the run
    // itself completed rather than aborting.
    expect(run).toMatchObject({ ran: true, scanned: 2, failed: 1, parked: 1 });
  });

  it("never throws out of the scheduled entry point, whatever the database does", async () => {
    const exploding = {
      from() {
        throw new Error("database is gone");
      },
    } as unknown as SupabaseClient<Database>;

    await expect(runBatStoreStockSyncScheduled(exploding, { now: NOW })).resolves.toMatchObject({
      ran: false,
      reason: "store_error",
    });
  });

  it("never throws when the supplier is unreachable", async () => {
    supplier.listProducts.mockRejectedValue(new Error("network down"));
    const { client } = createFakeSupabase({
      provider_sync_state: () => ({ data: { last_run_at: null }, error: null }),
      store_settings: () => settingsWithKey,
      // The mapping must exist, or the run would short-circuit before it ever
      // reaches the supplier and would report a healthy empty run.
      provider_offer_mappings: () => ({
        data: [{ offer_id: OFFER_WITH_STOCK, external_product_id: "16", metadata: {} }],
        error: null,
      }),
      offers: () => ({ data: [{ id: OFFER_WITH_STOCK, is_active: true }], error: null }),
    });

    await expect(runBatStoreStockSyncScheduled(client, { now: NOW })).resolves.toMatchObject({
      ran: false,
      reason: "store_error",
    });
  });
});
