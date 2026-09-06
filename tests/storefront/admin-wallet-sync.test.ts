import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), sync: vi.fn() }));
vi.mock("@server/lib/auth/guards", async (original) => {
  const guards = await original<typeof import("../../storefront/app/.server/lib/auth/guards")>();
  return { ...guards, requireAdmin: mocks.authorize };
});
vi.mock("@server/lib/services/admin-overview.service", () => ({ syncWalletCard: mocks.sync }));

import { ForbiddenError, UnauthorizedError } from "../../storefront/app/.server/lib/auth/guards";
import { action, loader } from "../../storefront/app/routes/api-admin-wallet-sync";

function request(key = "g2bulk", origin = "https://store.test", method = "POST") {
  return new Request("https://store.test/api/admin/wallet-sync", {
    method,
    headers: { origin },
    body: new URLSearchParams({ intent: "syncWallet", key }),
  });
}

beforeEach(() => {
  mocks.authorize.mockReset().mockResolvedValue({ id: "admin" });
  mocks.sync.mockReset().mockResolvedValue({ ok: true, card: {
    balances: [{ currency: "USD", amount: 42 }], syncedAt: "2026-09-06T10:00:00Z",
  } });
});

describe("dashboard wallet sync resource", () => {
  it.each([[UnauthorizedError, 401], [ForbiddenError, 403]] as const)("blocks %s before supplier traffic", async (ErrorClass, status) => {
    mocks.authorize.mockRejectedValueOnce(new ErrorClass());
    const response = await action({ request: request() });
    expect(response.status).toBe(status);
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it("rejects cross-origin and invalid input before supplier traffic", async () => {
    expect((await action({ request: request("g2bulk", "https://other.test") })).status).toBe(403);
    expect((await action({ request: request("") })).status).toBe(400);
    expect((await action({ request: request("x".repeat(161)) })).status).toBe(400);
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it("returns one updated balance as JSON and disables caching", async () => {
    const response = await action({ request: request(" g2bulk ") });
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true, balances: [{ currency: "USD", amount: 42 }], syncedAt: "2026-09-06T10:00:00Z" });
    expect(mocks.sync).toHaveBeenCalledExactlyOnceWith("g2bulk");
  });

  it("keeps supplier failure isolated to its card", async () => {
    mocks.sync.mockResolvedValueOnce({ ok: false, errorKind: "unreachable" });
    expect(await (await action({ request: request() })).json()).toEqual({ ok: false, errorKind: "unreachable" });
  });

  it("never refreshes on GET or unsupported methods", async () => {
    expect(loader().status).toBe(405);
    expect((await action({ request: request("g2bulk", "https://store.test", "PUT") })).status).toBe(405);
    expect(mocks.sync).not.toHaveBeenCalled();
  });
});
