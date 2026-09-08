import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  guard: vi.fn(), readiness: vi.fn(),
  readers: Object.fromEntries(["getAdminOverviewStats", "getAttentionCounts", "getDailySeries", "getEarnings", "getLatestOrders", "getSalesKpis", "getWalletCards"].map((key) => [key, vi.fn()])),
}));
vi.mock("@server/dashboard-access", () => ({ requireDashboardAdmin: mocks.guard }));
vi.mock("@server/lib/services/admin-readiness.service", () => ({ getCatalogReadiness: mocks.readiness }));
vi.mock("@server/lib/services/admin-overview.service", () => mocks.readers);
import { loader } from "../../storefront/app/routes/dashboard-index";

const load = () => loader({ params: { locale: "en" }, request: new Request("https://store.example/en/dashboard"), context: {} });
beforeEach(() => {
  mocks.guard.mockResolvedValue(undefined);
  mocks.readiness.mockResolvedValue(null);
  Object.values(mocks.readers).forEach((reader) => reader.mockResolvedValue(null));
});

describe("overview loader", () => {
  it("keeps other panels usable when independent metric readers fail", async () => {
    Object.values(mocks.readers).forEach((reader) => reader.mockRejectedValue(new Error("Service unavailable")));
    const readiness = { publishedProducts: 0, missingOffers: 0, missingArtwork: 0, missingCategory: 0, needsAttention: 0, items: [] };
    mocks.readiness.mockResolvedValue(readiness);
    const data = await load();
    expect(Object.values(data.stats)).toEqual([null, null, null, null, null, null]);
    expect(Object.values(data.attention)).toEqual([null, null, null, null, null]);
    expect(Object.values(data.kpis)).toEqual([null, null, null, null, null, null]);
    expect([data.earnings, data.series, data.latest, data.wallets]).toEqual([null, null, null, null]);
    expect(data.readiness).toEqual(readiness);
    expect(Number.isNaN(Date.parse(data.updatedAt))).toBe(false);
  });

  it("authenticates before starting any overview reads", async () => {
    mocks.guard.mockRejectedValueOnce(new Response(null, { status: 403 }));
    await expect(load()).rejects.toMatchObject({ status: 403 });
    expect(mocks.readiness).not.toHaveBeenCalled();
    Object.values(mocks.readers).forEach((reader) => expect(reader).not.toHaveBeenCalled());
  });
});
