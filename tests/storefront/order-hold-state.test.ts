import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@server/types/database";
import type { FulfillmentContext } from "@server/fulfillment/context";

/**
 * The held-order lifecycle.
 *
 * The behaviour under test is the one that cost the store three paid orders: a
 * supplier refusing for lack of funds must park the order where the owner can
 * see it and deliver it in one press — never refund it, never leave it in a
 * `processing` limbo nothing picks up, and never buy it twice.
 */

const mocks = vi.hoisted(() => ({
  service: vi.fn(),
  readCredentials: vi.fn(),
  providerFulfill: vi.fn(),
  admin: vi.fn(),
  notify: vi.fn(),
  telegram: vi.fn(),
  audit: vi.fn(),
  logInfo: vi.fn(),
}));

vi.mock("@server/lib/auth/guards", () => ({
  requireAdminId: mocks.admin,
  requireAdmin: mocks.admin,
}));
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
vi.mock("@server/lib/logging/logger", () => ({
  log: { info: mocks.logInfo, warn: vi.fn(), error: vi.fn() },
  logFailure: vi.fn(),
  logOutcome: vi.fn(),
}));
/*
 * The provider registry is stubbed, not `@server/fulfillment/index`. Everything
 * under test lives in the real fulfilment modules, and "the sweep must not buy"
 * can only be proven if the purchase call it would use is a spy.
 */
vi.mock("@server/fulfillment/providers", () => {
  const adapter = {
    readCredentials: mocks.readCredentials,
    fulfill: mocks.providerFulfill,
    poll: vi.fn(),
  };

  return {
    getFulfillmentProvider: (name: string | null) => (name ? adapter : null),
  };
});

import { G2BulkError } from "@server/providers/g2bulk/errors";
import {
  hasInsufficientBalanceAttempt,
  isHeldOrderLike,
  isHeldOrderStatus,
  isLowBalanceError,
  isSettledOrderStatus,
  INSUFFICIENT_BALANCE_CODE,
} from "@server/lib/orders/order-status";
import { handlePurchaseError } from "@server/fulfillment/settle";
import { reconcileOrder } from "@server/fulfillment/index";
import { retryFulfillment } from "@server/lib/services/admin-order-ops.service";
import { deliverHeldOrder } from "@server/lib/services/admin-hold.service";
import { heldLabel } from "@/components/checkout/order-status";
import { getMessages } from "@/i18n/messages";

const ORDER_ID = "11111111-1111-4111-8111-111111111111";
const ITEM_ID = "22222222-2222-4222-8222-222222222222";
const OFFER_ID = "33333333-3333-4333-8333-333333333333";

function client(value: unknown) {
  return value as SupabaseClient<Database>;
}

type FakeOptions = {
  order?: Record<string, unknown> | null;
  item?: Record<string, unknown> | null;
  attempts?: Record<string, unknown>[];
  mapping?: { provider_name: string } | null;
  extra?: Record<string, { single?: unknown; many?: unknown }>;
};

/**
 * A stand-in for the service-role Supabase client, answering by table with data
 * declared per test and recording every write.
 *
 * It has to model four reads, because the real code chains through all of them:
 * the order and its item (`loadContext`), the offer's supplier mapping (again
 * `loadContext`), the attempt row (`reconcileOrder`) and the single order row
 * the admin operations load. A stub that answers only one of them would let the
 * flows short-circuit into `skipped` and prove nothing.
 */
function fakeService(options: FakeOptions = {}) {
  const updates: { table: string; values: Record<string, unknown> }[] = [];
  const ordersRow =
    options.order === undefined
      ? null
      : options.order === null
        ? null
        : {
            payment_status: "paid",
            payment_method: "wallet",
            subtotal: 5,
            discount: 0,
            total: 5,
            currency: "USD",
            customer_note: null,
            metadata: {},
            created_at: "2026-10-10T00:00:00.000Z",
            ...options.order,
            order_items: options.item ?? null,
          };

  const tableData: Record<string, { single?: unknown; many?: unknown }> = {
    orders: { single: ordersRow, many: ordersRow ? [ordersRow] : [] },
    order_items: { single: options.item ?? null, many: options.item ? [options.item] : [] },
    profiles: {
      single: { id: "user-1", email: "buyer@example.com", full_name: "Buyer", username: "buyer" },
      many: [{ id: "user-1", email: "buyer@example.com", full_name: "Buyer", username: "buyer" }],
    },
    offers: { single: { product_id: null, delivery_kind: "account" }, many: [] },
    provider_offer_mappings: { single: options.mapping ?? null, many: [] },
    provider_game_mappings: { single: null, many: [] },
    fulfillment_attempts: {
      single: (options.attempts ?? [])[0] ?? null,
      many: options.attempts ?? [],
    },
    wallet_transactions: { single: null, many: [] },
    ...(options.extra ?? {}),
  };

  const from = (table: string) => {
    const entry = tableData[table] ?? { single: null, many: [] };

    const builder = {
      select: () => builder,
      eq: () => builder,
      is: () => builder,
      in: () => builder,
      not: () => builder,
      or: () => builder,
      order: () => builder,
      limit: () => builder,
      update: (values: Record<string, unknown>) => {
        updates.push({ table, values });
        return builder;
      },
      upsert: () => builder,
      insert: () => builder,
      maybeSingle: async () => ({ data: entry.single ?? null, error: null }),
      single: async () => ({ data: entry.single ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve({ data: entry.many ?? [], error: null }).then(resolve, reject),
    };

    return builder;
  };

  const rpc = vi.fn().mockResolvedValue({ data: null, error: null });

  return { client: { from, rpc }, updates, rpc };
}

function context(overrides: Partial<FulfillmentContext> = {}): FulfillmentContext {
  return {
    orderId: ORDER_ID,
    orderNumber: "GS-TESTHELD01",
    orderItemId: ITEM_ID,
    offerId: OFFER_ID,
    offerType: "topup",
    quantity: 2,
    dynamicFields: { userid: "player-1" },
    gameCode: "mlbb",
    catalogueName: "55 Diamonds",
    externalProductId: null,
    status: "fulfilling",
    paymentMethod: "wallet",
    providerName: "g2bulk",
    requiredSupplierCostUsd: 1.5,
    deliveryKind: "account",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.admin.mockResolvedValue({ id: "admin" });
  mocks.providerFulfill.mockReset();
  // A configured supplier, so the flows reach the purchase call this suite is
  // proving must or must not happen.
  mocks.readCredentials.mockResolvedValue("test-api-key");
});

describe("low-balance classification", () => {
  it("recognises the supplier refusals that mean the store's wallet is empty", () => {
    expect(isLowBalanceError(new G2BulkError("request", "Insufficient balance to complete this order."))).toBe(true);
    expect(isLowBalanceError(new Error("Your balance is not enough"))).toBe(true);
    expect(isLowBalanceError(new Error("رصيد غير كاف"))).toBe(true);
  });

  it("does not classify a rejected order as a funding problem", () => {
    expect(isLowBalanceError(new G2BulkError("request", "Invalid player ID. Please check and try again."))).toBe(false);
    expect(isLowBalanceError(new G2BulkError("request", "Insufficient stock for product #16 (requested 1, available 0)"))).toBe(false);
  });
});

describe("held-like recognition across the status eras", () => {
  it("treats the held status as held", () => {
    expect(isHeldOrderStatus("held")).toBe(true);
    expect(isHeldOrderLike("held", [])).toBe(true);
  });

  it("never treats a held order as a settled debt", () => {
    /*
     * The load-bearing invariant behind the deliver button: `isSettledOrderStatus`
     * gates both `retryFulfillment` and `markDelivered`, so a held order counted
     * as settled would be undeliverable by every operator path at once.
     */
    expect(isSettledOrderStatus("held")).toBe(false);
  });

  it("treats a legacy processing order with an insufficient_balance attempt as held", () => {
    expect(
      isHeldOrderLike("processing", [
        { error_code: INSUFFICIENT_BALANCE_CODE, error_message: "Insufficient balance to complete this order." },
      ]),
    ).toBe(true);
  });

  it("does not treat an ordinary in-flight or failed order as held", () => {
    expect(isHeldOrderLike("processing", [{ status: "processing" }])).toBe(false);
    expect(isHeldOrderLike("fulfilling", [{ error_code: null, error_message: null }])).toBe(false);
    expect(isHeldOrderLike("failed", [{ error_code: "request", error_message: "Invalid player ID" }])).toBe(false);
    expect(isHeldOrderLike("completed", [])).toBe(false);
  });

  it("detects the balance attempt by code or by wording", () => {
    expect(hasInsufficientBalanceAttempt([{ errorCode: INSUFFICIENT_BALANCE_CODE }])).toBe(true);
    expect(hasInsufficientBalanceAttempt([{ errorMessage: "Your balance is not enough to complete this purchase" }])).toBe(true);
    expect(hasInsufficientBalanceAttempt([{ errorCode: "server", errorMessage: "timeout" }])).toBe(false);
  });
});

describe("a low-balance purchase failure holds the order instead of refunding it", () => {
  it("writes a retryable attempt, holds the order, and never calls the refund RPC", async () => {
    const { client: service, updates, rpc } = fakeService();
    mocks.service.mockReturnValue(service);

    const outcome = await handlePurchaseError(
      context(),
      ITEM_ID,
      new G2BulkError("request", "Insufficient balance to complete this order."),
    );

    expect(outcome.state).toBe("held");

    // The attempt keeps the order retryable and names the reason.
    const attemptUpdate = updates.find((entry) => entry.table === "fulfillment_attempts");
    expect(attemptUpdate?.values.status).toBe("failed");
    expect(attemptUpdate?.values.error_code).toBe(INSUFFICIENT_BALANCE_CODE);
    expect(attemptUpdate?.values.error_message).toContain("Insufficient balance");

    // The order is held, explained, and timestamped — never `processing`.
    const orderUpdate = updates.find((entry) => entry.table === "orders");
    expect(orderUpdate?.values.status).toBe("held");
    expect(orderUpdate?.values.held_reason).toContain("Insufficient balance");
    expect(typeof orderUpdate?.values.held_at).toBe("string");
    expect(updates.some((entry) => entry.table === "orders" && entry.values.status === "processing")).toBe(false);

    // Nothing moves money: no refund RPC was called.
    expect(rpc).not.toHaveBeenCalled();

    // The owner is told, once per order, with what to recharge.
    const alert = mocks.telegram.mock.calls.find((call) => call[0]?.type === "low_wallet");
    expect(alert?.[0].dedupKey).toBe(ORDER_ID);
    expect(alert?.[0].payload.order_number).toBe("GS-TESTHELD01");
    expect(alert?.[0].payload.quantity).toBe(2);
    expect(alert?.[0].payload.required).toBe(3);
  });

  it("tells the customer the order is queued, without mentioning the store's balance", async () => {
    const { client: service } = fakeService({
      order: { id: ORDER_ID, order_number: "GS-TESTHELD01", status: "held", user_id: "user-1" },
    });
    mocks.service.mockReturnValue(service);

    const { announceOutcome } = await import("@server/fulfillment/settle");
    await announceOutcome(context(), {
      state: "held",
      reason: "Supplier balance insufficient: Insufficient balance to complete this order.",
    });

    expect(mocks.notify).toHaveBeenCalledTimes(1);
    const notification = mocks.notify.mock.calls[0][0];

    expect(notification.type).toBe("order_queued");
    expect(notification.titleEn).toContain("being prepared");
    expect(notification.titleAr).toContain("قيد التجهيز");
    expect(notification.bodyEn).toContain("GS-TESTHELD01");
    expect(notification.bodyAr).toContain("GS-TESTHELD01");

    // No jargon, no supplier, no balance, no promised time, no refund claim.
    const customerFacing = `${notification.titleEn} ${notification.bodyEn} ${notification.titleAr} ${notification.bodyAr}`;
    expect(customerFacing).not.toMatch(/balance|supplier|refund|insufficient/i);
    expect(customerFacing).not.toMatch(/رصيد|المورد|استرداد/);

    // And the same wording is what the order page and the Telegram bot render.
    const ar = getMessages("ar", "checkout");
    const en = getMessages("en", "checkout");
    expect(heldLabel(ar)).toBe(ar.orderDetail.queuedLabel);
    expect(heldLabel(en)).toBe(en.orderDetail.queuedLabel);
    expect(ar.statuses.held).toBe(ar.orderDetail.queuedLabel);
    expect(en.statuses.held).toBe(en.orderDetail.queuedLabel);
    expect(ar.orderDetail.queuedLabel).not.toMatch(/held|معلّق|معلق/i);
    expect(en.orderDetail.queuedLabel).not.toMatch(/held/i);
    expect(en.orderDetail.queuedTitle).toBeTruthy();
    expect(en.orderDetail.queuedDescription).toContain("you do not need to do anything");
    expect(ar.orderDetail.queuedDescription).toContain("لا حاجة لأي إجراء");
  });
});

describe("the sweep never buys or refunds a held order", () => {
  it("returns wait for a held order without a supplier order id and does not purchase", async () => {
    const { client: service, updates, rpc } = fakeService({
      order: {
        id: ORDER_ID,
        order_number: "GS-TESTHELD01",
        status: "held",
        payment_status: "paid",
        payment_method: "wallet",
        held_reason: "Supplier balance insufficient",
        held_at: "2026-10-10T00:00:00.000Z",
      },
      item: {
        id: ITEM_ID,
        offer_id: OFFER_ID,
        quantity: 1,
        dynamic_fields: { userid: "player-1" },
        metadata: { offer_type: "topup" },
      },
      mapping: { provider_name: "g2bulk" },
      // A paid attempt that would otherwise be polled, so the held check is the
      // only thing standing between this order and a supplier call.
      attempts: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          status: "failed",
          external_order_id: null,
          created_at: "2026-10-10T00:00:00.000Z",
          error_code: INSUFFICIENT_BALANCE_CODE,
          error_message: "Insufficient balance to complete this order.",
        },
      ],
    });
    mocks.service.mockReturnValue(service);

    const outcome = await reconcileOrder(ORDER_ID);

    expect(outcome.action).toBe("wait");
    expect(outcome.reason).toContain("Held");
    expect(mocks.providerFulfill).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    expect(updates.some((entry) => entry.values.status === "completed")).toBe(false);
    expect(updates.some((entry) => entry.values.status === "refunded")).toBe(false);
  });

  it("does not purchase a paid attempt path for a held order even when a purchase claim exists", async () => {
    const { client: service } = fakeService({
      order: {
        id: ORDER_ID,
        order_number: "GS-TESTHELD01",
        status: "held",
        payment_status: "paid",
      },
      item: {
        id: ITEM_ID,
        offer_id: OFFER_ID,
        quantity: 1,
        dynamic_fields: {},
        metadata: { offer_type: "topup" },
      },
      mapping: { provider_name: "g2bulk" },
    });
    mocks.service.mockReturnValue(service);

    const outcome = await reconcileOrder(ORDER_ID);

    expect(outcome.action).toBe("wait");
    expect(mocks.providerFulfill).not.toHaveBeenCalled();
  });
});

describe("operator recovery on a held order", () => {
  it("refuses to deliver an order that is already completed", async () => {
    const { client: service } = fakeService({
      order: { id: ORDER_ID, order_number: "GS-1", status: "completed", user_id: "user-1" },
    });
    mocks.service.mockReturnValue(service);

    await expect(deliverHeldOrder(client({}), ORDER_ID)).rejects.toThrow("already delivered");
    expect(mocks.providerFulfill).not.toHaveBeenCalled();
  });

  it("refuses to deliver a refunded order", async () => {
    const { client: service } = fakeService({
      order: { id: ORDER_ID, order_number: "GS-1", status: "refunded", user_id: "user-1" },
    });
    mocks.service.mockReturnValue(service);

    await expect(deliverHeldOrder(client({}), ORDER_ID)).rejects.toThrow("refunded");
    expect(mocks.providerFulfill).not.toHaveBeenCalled();
  });

  it("refuses to release an order that is not waiting on supplier funds", async () => {
    const { client: service } = fakeService({
      order: { id: ORDER_ID, order_number: "GS-1", status: "fulfilling", user_id: "user-1" },
    });
    mocks.service.mockReturnValue(service);

    await expect(deliverHeldOrder(client({}), ORDER_ID)).rejects.toThrow("not waiting on supplier funds");
    expect(mocks.providerFulfill).not.toHaveBeenCalled();
  });

  it("delivers a held order and clears the hold on success", async () => {
    const { client: service, updates } = fakeService({
      order: { id: ORDER_ID, order_number: "GS-1", status: "held", user_id: "user-1" },
      item: {
        id: ITEM_ID,
        offer_id: OFFER_ID,
        quantity: 1,
        dynamic_fields: { userid: "player-1" },
        metadata: { offer_type: "topup" },
      },
      mapping: { provider_name: "g2bulk" },
    });
    mocks.service.mockReturnValue(service);
    mocks.providerFulfill.mockResolvedValue({ state: "completed", deliveredItems: [] });

    const result = await deliverHeldOrder(client({}), ORDER_ID);

    expect(mocks.providerFulfill).toHaveBeenCalledTimes(1);
    expect(result.delivered).toBe(true);
    expect(updates.some((entry) => entry.values.held_reason === null && entry.values.held_at === null)).toBe(true);
  });

  it("keeps a held order held when the supplier still refuses", async () => {
    const { client: service, updates } = fakeService({
      order: { id: ORDER_ID, order_number: "GS-1", status: "held", user_id: "user-1" },
      item: {
        id: ITEM_ID,
        offer_id: OFFER_ID,
        quantity: 1,
        dynamic_fields: { userid: "player-1" },
        metadata: { offer_type: "topup" },
      },
      mapping: { provider_name: "g2bulk" },
    });
    mocks.service.mockReturnValue(service);
    mocks.providerFulfill.mockResolvedValue({ state: "held", reason: "Supplier balance insufficient: still empty" });

    const result = await deliverHeldOrder(client({}), ORDER_ID);

    expect(result.delivered).toBe(false);
    // The hold is not cleared, and no write pretends it was delivered.
    expect(updates.some((entry) => entry.values.held_reason === null)).toBe(false);
    expect(updates.some((entry) => entry.values.status === "completed")).toBe(false);
  });

  it("still refuses to retry a completed, refunded or cancelled order, but allows held", async () => {
    for (const status of ["completed", "refunded", "cancelled"]) {
      const { client: service } = fakeService({
        order: { id: ORDER_ID, order_number: "GS-1", status, payment_status: "paid", payment_method: "wallet" },
      });
      mocks.service.mockReturnValue(service);

      await expect(retryFulfillment(client({}), ORDER_ID)).rejects.toThrow();
      expect(mocks.providerFulfill).not.toHaveBeenCalled();
    }

    const { client: service } = fakeService({
      order: { id: ORDER_ID, order_number: "GS-1", status: "held", payment_status: "paid", payment_method: "wallet" },
      item: {
        id: ITEM_ID,
        offer_id: OFFER_ID,
        quantity: 1,
        dynamic_fields: { userid: "player-1" },
        metadata: { offer_type: "topup" },
      },
      mapping: { provider_name: "g2bulk" },
    });
    mocks.service.mockReturnValue(service);
    mocks.providerFulfill.mockResolvedValue({ state: "completed", deliveredItems: [] });

    await expect(retryFulfillment(client({}), ORDER_ID)).resolves.toMatchObject({ state: "completed" });
    expect(mocks.providerFulfill).toHaveBeenCalledTimes(1);
  });
});
