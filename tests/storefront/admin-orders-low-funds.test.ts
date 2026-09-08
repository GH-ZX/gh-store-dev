import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@server/types/database";

vi.mock("@server/lib/auth/guards", () => ({
  requireAdminId: vi.fn().mockResolvedValue({ id: "admin-123" }),
}));

import {
  getOrders,
  LOW_FUNDS_FILTER,
} from "@server/lib/services/admin-orders.service";

describe("admin orders low funds visibility and filtering", () => {
  it("exports LOW_FUNDS_FILTER as 'low_funds'", () => {
    expect(LOW_FUNDS_FILTER).toBe("low_funds");
  });

  it("identifies low balance errors in order attempts and flags hasLowBalanceError", async () => {
    const mockOrders = [
      {
        id: "order-1",
        order_number: "GH-1001",
        status: "failed",
        payment_status: "paid",
        total: 10,
        currency: "USD",
        created_at: new Date().toISOString(),
        user_id: "user-1",
        profiles: { id: "user-1", email: "customer@example.com", full_name: "Customer", username: "cust" },
        order_items: [
          {
            id: "item-1",
            name_ar_snapshot: "منتج 1",
            name_en_snapshot: "Product 1",
            fulfillment_attempts: [
              {
                status: "failed",
                error_code: "insufficient_balance",
                error_message: "Your balance is not enough to complete this purchase",
                created_at: new Date().toISOString(),
              },
            ],
          },
        ],
      },
      {
        id: "order-2",
        order_number: "GH-1002",
        status: "completed",
        payment_status: "paid",
        total: 25,
        currency: "USD",
        created_at: new Date().toISOString(),
        user_id: "user-2",
        profiles: { id: "user-2", email: "other@example.com", full_name: "Other", username: "other" },
        order_items: [
          {
            id: "item-2",
            name_ar_snapshot: "منتج 2",
            name_en_snapshot: "Product 2",
            fulfillment_attempts: [
              {
                status: "completed",
                error_code: null,
                error_message: null,
                created_at: new Date().toISOString(),
              },
            ],
          },
        ],
      },
    ];

    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: (resolve: (val: unknown) => unknown) => Promise.resolve({ data: mockOrders, error: null }).then(resolve),
    };

    const mockSupabase = {
      from: vi.fn().mockReturnValue(mockQuery),
    } as unknown as SupabaseClient<Database>;

    const allOrders = await getOrders(mockSupabase);
    expect(allOrders).toHaveLength(2);
    expect(allOrders[0].hasLowBalanceError).toBe(true);
    expect(allOrders[0].latestErrorMessage).toBe("Your balance is not enough to complete this purchase");
    expect(allOrders[1].hasLowBalanceError).toBe(false);

    const lowFundsOrders = await getOrders(mockSupabase, { status: "low_funds" });
    expect(lowFundsOrders).toHaveLength(1);
    expect(lowFundsOrders[0].id).toBe("order-1");
    expect(lowFundsOrders[0].hasLowBalanceError).toBe(true);
  });
});
