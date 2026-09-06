import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@server/types/database";

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  notify: vi.fn(),
  telegram: vi.fn(),
  audit: vi.fn(),
  service: vi.fn(),
  fulfill: vi.fn(),
}));
vi.mock("@server/lib/auth/guards", () => ({ requireAdminId: mocks.admin }));
vi.mock("@server/lib/services/notification.service", () => ({
  notify: mocks.notify,
}));
vi.mock("@server/lib/services/telegram-alerts.service", () => ({
  enqueueTelegramAlert: mocks.telegram,
}));
vi.mock("@server/lib/services/admin-audit.service", () => ({
  recordAudit: mocks.audit,
}));
vi.mock("@server/lib/supabase/service", () => ({
  createSupabaseServiceClient: mocks.service,
  hasServiceRoleKey: () => true,
}));
vi.mock("@server/fulfillment/index", () => ({ fulfillOrder: mocks.fulfill }));
vi.mock("@server/lib/logging/logger", () => ({
  log: { warn: vi.fn() },
  logOutcome: vi.fn(),
}));

import {
  approveRecharge,
  rejectRecharge,
} from "@server/lib/services/admin-recharge.service";
import {
  refundOrderManually,
  retryFulfillment,
} from "@server/lib/services/admin-order-ops.service";

const id = "11111111-1111-4111-8111-111111111111";
function client(value: unknown) {
  return value as SupabaseClient<Database>;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.admin.mockResolvedValue({ id: "admin" });
});

describe("migrated admin money operations", () => {
  it("refuses recharge approval before calling the RPC when the session is not admin", async () => {
    mocks.admin.mockRejectedValueOnce(new Error("Forbidden"));
    const rpc = vi.fn();
    await expect(
      approveRecharge(client({ rpc }), {
        requestId: id,
        creditAmount: 15,
        note: null,
      }),
    ).rejects.toThrow("Forbidden");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("preserves the atomic recharge RPC and suppresses duplicate credit notifications", async () => {
    const maybeSingle = vi
      .fn()
      .mockResolvedValue({
        data: { credited: 15, balance: 20, idempotent: true },
        error: null,
      });
    const rpc = vi.fn().mockReturnValue({ maybeSingle });
    const result = await approveRecharge(client({ rpc }), {
      requestId: id,
      creditAmount: 15,
      note: "Confirmed",
    });
    expect(rpc).toHaveBeenCalledWith("approve_recharge_request", {
      p_request_id: id,
      p_credit_amount: 15,
      p_note: "Confirmed",
    });
    expect(result).toEqual({ credited: 15, balance: 20, idempotent: true });
    expect(mocks.notify).not.toHaveBeenCalled();
    expect(mocks.telegram).not.toHaveBeenCalled();
  });

  it("reports a settled recharge refusal without sending a rejection notification", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({
        error: { message: "This request is already settled" },
      });
    await expect(
      rejectRecharge(client({ rpc }), {
        requestId: id,
        note: "Missing transfer",
      }),
    ).rejects.toThrow("already settled");
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("does not retry fulfillment for refunded orders", async () => {
    const maybeSingle = vi
      .fn()
      .mockResolvedValue({
        data: { id, status: "refunded", payment_status: "refunded" },
      });
    mocks.service.mockReturnValue({
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
    });
    await expect(retryFulfillment(client({}), id)).rejects.toThrow("refunded");
    expect(mocks.fulfill).not.toHaveBeenCalled();
  });

  it("does not refund completed deliveries", async () => {
    const rpc = vi.fn();
    const maybeSingle = vi
      .fn()
      .mockResolvedValue({
        data: {
          id,
          status: "completed",
          payment_status: "paid",
          payment_method: "wallet",
        },
      });
    mocks.service.mockReturnValue({
      rpc,
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
    });
    await expect(
      refundOrderManually(client({}), id, "Customer request"),
    ).rejects.toThrow("already delivered");
    expect(rpc).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });
});
