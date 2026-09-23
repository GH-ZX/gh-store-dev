import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  context: vi.fn(), lookup: vi.fn(), credentials: vi.fn(), fulfill: vi.fn(), poll: vi.fn(),
  record: vi.fn(), status: vi.fn(), announce: vi.fn(), refund: vi.fn(),
}));
vi.mock("@server/fulfillment/context", () => ({ loadContext: mocks.context, providerIdempotencyKey: (id: string) => id }));
vi.mock("@server/fulfillment/providers", () => ({ getFulfillmentProvider: (name: string) =>
  ["g2bulk", "maxstore", "batstore"].includes(name) ? { readCredentials: mocks.credentials, fulfill: mocks.fulfill, poll: mocks.poll } : null,
}));
vi.mock("@server/lib/supabase/service", () => ({ hasServiceRoleKey: () => true, createSupabaseServiceClient: () => ({
  from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: mocks.lookup }) }) }) }),
}) }));
vi.mock("@server/fulfillment/attempts", () => ({ recordAttempt: mocks.record, setOrderStatus: mocks.status }));
vi.mock("@server/fulfillment/settle", () => ({ announceOutcome: mocks.announce, failAndRefund: mocks.refund, describe: () => ({ customer: "Supplier unavailable", code: "network" }) }));
vi.mock("@server/fulfillment/stored", () => ({ fulfillStored: vi.fn() }));
vi.mock("@server/lib/logging/logger", () => ({ log: { warn: vi.fn() } }));
import { fulfillOrder, reconcileOrder } from "@server/fulfillment/index";

const context = { orderId: "order", orderItemId: "item", providerName: "g2bulk", deliveryKind: "account", offerType: "topup", status: "paid" };
const attempt = { id: "attempt", status: "processing", external_order_id: "supplier-order", created_at: new Date(Date.now() - 20 * 60_000).toISOString() };
beforeEach(() => {
  mocks.context.mockResolvedValue(context);
  mocks.lookup.mockResolvedValue({ data: attempt, error: null });
  mocks.credentials.mockResolvedValue("test-only");
  mocks.fulfill.mockResolvedValue({ state: "processing" });
  mocks.poll.mockResolvedValue({ state: "pending" });
});
describe("safe provider dispatch", () => {
  it.each([null, "new-supplier", "constructor", "toString"])("never purchases or polls an unmapped supplier: %s", async (providerName) => {
    mocks.context.mockResolvedValue({ ...context, providerName });
    expect(await fulfillOrder("order")).toMatchObject({ state: "skipped" });
    expect(await reconcileOrder("order")).toMatchObject({ action: "escalated" });
    expect(mocks.credentials).not.toHaveBeenCalled();
    expect(mocks.fulfill).not.toHaveBeenCalled();
    expect(mocks.poll).not.toHaveBeenCalled();
  });
  it("does not treat a failed attempt lookup as permission to buy again", async () => {
    mocks.lookup.mockResolvedValue({ data: null, error: { message: "database unavailable" } });
    expect(await reconcileOrder("order")).toMatchObject({ action: "wait" });
    expect(mocks.fulfill).not.toHaveBeenCalled();
    expect(mocks.refund).not.toHaveBeenCalled();
  });
  it("keeps ambiguous purchases for manual reconciliation", async () => {
    mocks.lookup.mockResolvedValue({ data: { ...attempt, external_order_id: null }, error: null });
    expect(await reconcileOrder("order")).toMatchObject({ action: "escalated" });
    expect(mocks.fulfill).not.toHaveBeenCalled();
    expect(mocks.poll).not.toHaveBeenCalled();
  });
  it.each(["g2bulk", "maxstore", "batstore"])("polls the selected %s adapter without purchasing again", async (providerName) => {
    mocks.context.mockResolvedValue({ ...context, providerName });
    expect(await reconcileOrder("order")).toMatchObject({ action: "wait" });
    expect(mocks.poll).toHaveBeenCalledWith({ ...context, providerName }, "test-only", "supplier-order");
    expect(mocks.fulfill).not.toHaveBeenCalled();
  });
  it("preserves first fulfillment of a paid order after a successful empty lookup", async () => {
    mocks.lookup.mockResolvedValue({ data: null, error: null });
    mocks.fulfill.mockResolvedValue({ state: "completed", deliveredItems: [] });
    expect(await reconcileOrder("order")).toMatchObject({ action: "completed" });
    expect(mocks.fulfill).toHaveBeenCalledTimes(1);
  });
  it("does not complete a digital delivery without its content", async () => {
    mocks.context.mockResolvedValue({ ...context, offerType: "gift_card", deliveryKind: "direct" });
    mocks.poll.mockResolvedValue({ state: "completed" });
    expect(await reconcileOrder("order")).toMatchObject({ action: "escalated" });
    expect(mocks.status).not.toHaveBeenCalled();
  });
  it("leaves an unreachable supplier unsettled", async () => {
    mocks.poll.mockRejectedValueOnce(new Error("timeout"));
    expect(await reconcileOrder("order")).toMatchObject({ action: "wait" });
    expect(mocks.refund).not.toHaveBeenCalled();
    expect(mocks.fulfill).not.toHaveBeenCalled();
  });
});
