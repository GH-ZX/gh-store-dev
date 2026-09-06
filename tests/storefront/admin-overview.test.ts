import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), rpc: vi.fn() }));
vi.mock("@server/lib/auth/guards", () => ({ requireAdmin: mocks.authorize }));
vi.mock("@server/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ rpc: mocks.rpc }) }));
vi.mock("@server/request-context", () => ({ memoizeRequest: (_key: string, load: () => Promise<unknown>) => load() }));
vi.mock("@server/legacy/lib/services/admin-settings.service", () => ({
  getBatStoreCredentials: vi.fn(), getG2BulkCredentials: vi.fn(),
  getMaxStoreCredentials: vi.fn(), getSamCredentials: vi.fn(),
}));

import { getAdminOverviewStats } from "../../storefront/app/.server/lib/services/admin-overview.service";

beforeEach(() => {
  mocks.authorize.mockReset().mockResolvedValue({ id: "admin" });
  mocks.rpc.mockReset();
});

const otherCounters = { offers: 29, active_offers: 20, orders: 7, customers: 3 };

describe("overview catalog RPC compatibility", () => {
  it("reads the deployed products query's legacy JSON keys", async () => {
    mocks.rpc.mockResolvedValue({ data: { catalog: { ...otherCounters, games: 12, active_games: 9 } }, error: null });
    expect(await getAdminOverviewStats()).toEqual({ products: 12, activeProducts: 9, offers: 29, activeOffers: 20, orders: 7, customers: 3 });
    expect(mocks.authorize).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("admin_overview_snapshot", { p_grace_minutes: 10 });
  });

  it("accepts product keys and keeps zero as a real count", async () => {
    mocks.rpc.mockResolvedValue({ data: { catalog: { ...otherCounters, products: 0, active_products: 0, games: 12, active_games: 9 } }, error: null });
    expect(await getAdminOverviewStats()).toMatchObject({ products: 0, activeProducts: 0 });
  });

  it("keeps failed queries unavailable instead of inventing empty counts", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "database unavailable" } });
    expect(await getAdminOverviewStats()).toEqual({ products: null, activeProducts: null, offers: null, activeOffers: null, orders: null, customers: null });
  });
});
