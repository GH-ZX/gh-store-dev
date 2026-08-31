import { beforeEach, describe, expect, it, vi } from "vitest";
import { placeOrder } from "@/lib/services/order.service";

const hoisted = vi.hoisted(() => {
  const callbacks: Array<() => void | Promise<void>> = [];

  return {
    callbacks,
    after: vi.fn((callback: () => void | Promise<void>) => callbacks.push(callback)),
    enqueueTelegramAlert: vi.fn(),
    fulfillOrder: vi.fn(),
    logFailure: vi.fn(),
    logOutcome: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));

vi.mock("next/server", () => ({
  after: hoisted.after,
}));

vi.mock("@/lib/auth/guards", () => ({
  isAdminProfile: () => false,
  requireAuth: async () => ({ id: "user-1" }),
  UnauthorizedError: class extends Error {},
}));

vi.mock("@/lib/services/g2bulk-availability.service", () => ({
  isG2BulkOfferAffordable: async () => true,
}));

vi.mock("@/lib/services/telegram-alerts.service", () => ({
  enqueueTelegramAlert: hoisted.enqueueTelegramAlert,
}));

vi.mock("@/lib/services/fulfillment.service", () => ({
  fulfillOrder: hoisted.fulfillOrder,
}));

vi.mock("@/lib/logging/logger", () => ({
  logFailure: hoisted.logFailure,
  logOutcome: hoisted.logOutcome,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => {
    const query = (data: unknown) => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => ({ data, error: null }),
      };

      return builder;
    };

    return {
      from: (table: string) =>
        table === "profiles"
          ? query({ role: "customer", is_active: true })
          : query({ id: "offer-1" }),
      rpc: () => ({
        maybeSingle: async () => ({
          data: {
            order_id: "order-1",
            order_number: "GH-1",
            total: 25,
            balance: 75,
          },
          error: null,
        }),
      }),
    };
  },
}));

describe("checkout fulfilment scheduling", () => {
  beforeEach(() => {
    hoisted.callbacks.length = 0;
    hoisted.after.mockClear();
    hoisted.enqueueTelegramAlert.mockClear();
    hoisted.fulfillOrder.mockReset();
    hoisted.logFailure.mockClear();
    hoisted.logOutcome.mockClear();
  });

  it("returns a paid order before running fulfilment and contains a scheduled rejection", async () => {
    const result = await placeOrder({
      gameSlug: "game",
      offerSlug: "offer",
      quantity: 1,
      dynamicFields: { player_id: "player-1" },
      idempotencyKey: "checkout-1",
    });

    expect(result).toEqual({
      ok: true,
      orderId: "order-1",
      orderNumber: "GH-1",
      total: 25,
      balance: 75,
    });
    expect(hoisted.after).toHaveBeenCalledTimes(1);
    expect(hoisted.callbacks).toHaveLength(1);
    expect(hoisted.fulfillOrder).not.toHaveBeenCalled();

    let rejectFulfilment!: (error: Error) => void;
    const supplierError = new Error("supplier unavailable");
    const supplierPromise = new Promise<void>((_resolve, reject) => {
      rejectFulfilment = reject;
    });
    hoisted.fulfillOrder.mockReturnValueOnce(supplierPromise);

    let callbackSettled = false;
    const callbackPromise = Promise.resolve(hoisted.callbacks[0]()).then(() => {
      callbackSettled = true;
    });

    await Promise.resolve();

    expect(hoisted.fulfillOrder).toHaveBeenCalledOnce();
    expect(hoisted.fulfillOrder).toHaveBeenCalledWith("order-1");
    expect(callbackSettled).toBe(false);

    rejectFulfilment(supplierError);

    await expect(callbackPromise).resolves.toBeUndefined();
    expect(hoisted.logFailure).toHaveBeenCalledOnce();
    expect(hoisted.logFailure).toHaveBeenCalledWith(
      "fulfilment",
      "checkout_fulfilment_threw",
      supplierError,
      { orderId: "order-1" },
    );
  });
});
