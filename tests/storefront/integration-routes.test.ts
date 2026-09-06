import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  secret: "sweep-secret" as string | undefined,
  configured: true,
  service: {},
  run: vi.fn(),
  success: vi.fn(),
  failure: vi.fn(),
  warn: vi.fn(),
}));
vi.mock("../../storefront/app/.server/runtime-env", () => ({ runtimeVar: () => mocks.secret }));
vi.mock("../../storefront/app/.server/lib/supabase/service", () => ({
  hasServiceRoleKey: () => mocks.configured,
  createSupabaseServiceClient: () => mocks.service,
}));
vi.mock("../../storefront/app/.server/lib/services/reconciliation.service", () => ({ reconcileStuckOrders: mocks.run }));
vi.mock("../../storefront/app/.server/lib/services/sweep-heartbeat.service", () => ({
  recordSweepSuccess: mocks.success,
  recordSweepFailure: mocks.failure,
}));
vi.mock("../../storefront/app/.server/lib/logging/logger", () => ({
  log: { warn: mocks.warn, error: vi.fn() },
  logFailure: vi.fn(),
}));

import { action as reconcile, loader as reconcileProbe } from "../../storefront/app/routes/api-reconcile";
import { action as cspReport, loader as cspProbe } from "../../storefront/app/routes/api-csp-report";

function request(authorization = "Bearer sweep-secret", method = "POST") {
  return new Request("https://store.test/api/reconcile", { method, headers: { authorization } });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.secret = "sweep-secret";
  mocks.configured = true;
  mocks.run.mockResolvedValue({ checked: 2, completed: 1, refunded: 1, samExpired: 0, binanceExpired: 0 });
});

describe("migrated reconciliation HTTP contract", () => {
  it.each(["", "Basic sweep-secret", "Bearer wrong"])("rejects unauthorized input %s before accessing services", async (authorization) => {
    const response = await reconcile({ request: request(authorization) });
    expect(response.status).toBe(401);
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("fails closed when no scheduler secret is configured", async () => {
    mocks.secret = undefined;
    expect((await reconcile({ request: request() })).status).toBe(401);
  });

  it("reports unavailable configuration without running the sweep", async () => {
    mocks.configured = false;
    const response = await reconcile({ request: request() });
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("300");
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("runs the existing settlement logic and stamps successful runs", async () => {
    const response = await reconcile({ request: request("bearer   sweep-secret  ") });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ ok: true, checked: 2, completed: 1, refunded: 1 });
    expect(mocks.run).toHaveBeenCalledWith(mocks.service);
    expect(mocks.success).toHaveBeenCalledWith(mocks.service);
  });

  it("stamps failed runs without exposing internal errors", async () => {
    const error = new Error("private database details");
    mocks.run.mockRejectedValueOnce(error);
    const response = await reconcile({ request: request() });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, error: "reconciliation_failed" });
    expect(mocks.failure).toHaveBeenCalledWith(mocks.service, error);
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it("rejects GET probes and other mutation methods", async () => {
    expect(reconcileProbe().status).toBe(405);
    expect(reconcileProbe().headers.get("Allow")).toBe("POST");
    expect((await reconcile({ request: request("Bearer sweep-secret", "DELETE") })).status).toBe(405);
    expect(mocks.run).not.toHaveBeenCalled();
  });
});

describe("migrated CSP report collector", () => {
  function report(body: unknown) {
    return new Request("https://store.test/api/csp-report", { method: "POST", body: JSON.stringify(body) });
  }

  it("normalizes legacy reports and limits logged field lengths", async () => {
    const response = await cspReport({ request: report({ "csp-report": { "effective-directive": "script-src", "blocked-uri": "x".repeat(400) } }) });
    expect(response.status).toBe(204);
    expect(mocks.warn).toHaveBeenCalledWith("security", "csp_violation_reported", expect.objectContaining({ directive: "script-src", blocked: "x".repeat(300) }));
  });

  it("accepts modern reporting API payloads", async () => {
    expect((await cspReport({ request: report([{ body: { effectiveDirective: "img-src", blockedURL: "https://blocked.test" } }]) })).status).toBe(204);
    expect(mocks.warn).toHaveBeenCalledWith("security", "csp_violation_reported", expect.objectContaining({ directive: "img-src", blocked: "https://blocked.test" }));
  });

  it("ignores malformed payloads, rejects oversized reports, and rejects probes", async () => {
    expect((await cspReport({ request: new Request("https://store.test/api/csp-report", { method: "POST", body: "invalid" }) })).status).toBe(204);
    expect((await cspReport({ request: new Request("https://store.test/api/csp-report", { method: "POST", headers: { "content-length": "16385" }, body: "{}" }) })).status).toBe(413);
    expect(cspProbe().status).toBe(405);
    expect((await cspReport({ request: request("", "DELETE") })).status).toBe(405);
    expect(mocks.warn).not.toHaveBeenCalled();
  });
});
