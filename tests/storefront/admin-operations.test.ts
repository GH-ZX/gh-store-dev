import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@server/types/database";

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  notify: vi.fn(),
  telegram: vi.fn(),
  audit: vi.fn(),
  service: vi.fn(),
  verify: vi.fn(),
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
vi.mock("@server/payments/bep20", () => ({ verifyBep20Transfer: mocks.verify }));
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
    const claim = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { payment_network: null, status: "approved", requested_amount: 15 }, error: null }) };
    const result = await approveRecharge(client({ rpc, from: vi.fn().mockReturnValue(claim) }), {
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

  it("refuses BEP20 approval without payer ownership confirmation before reading the chain", async () => {
    const rpc = vi.fn();
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { payment_network: "BEP20", status: "payment_sent" }, error: null }) };
    await expect(approveRecharge(client({ from: vi.fn().mockReturnValue(query), rpc }), { requestId: id, creditAmount: 15, note: "Confirmed" })).rejects.toThrow("Confirm payer ownership");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("uses the service-only verified approval RPC after checking the chain", async () => {
    const txHash = `0x${"a".repeat(64)}`;
    const destination = `0x${"b".repeat(40)}`;
    const rpc = vi.fn();
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { payment_network: "BEP20", payment_tx_hash: txHash, payment_destination: destination, status: "payment_sent", requested_amount: 15, created_at: new Date().toISOString() }, error: null }) };
    const serviceRpc = vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { credited: 15, balance: 15, idempotent: false }, error: null }) });
    mocks.verify.mockResolvedValue({ received_amount: 15 });
    mocks.service.mockReturnValue({ rpc: serviceRpc });
    const result = await approveRecharge(client({ from: vi.fn().mockReturnValue(query), rpc }), { requestId: id, creditAmount: 15, note: "Confirmed", payerVerified: true });
    expect(result).toMatchObject({ credited: 15, balance: 15 });
    expect(serviceRpc).toHaveBeenCalledWith("approve_verified_bep20_recharge_admin", expect.objectContaining({ p_actor: "admin", p_tx_hash: txHash }));
    expect(rpc).not.toHaveBeenCalled();
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
