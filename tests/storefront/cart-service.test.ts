import { describe, expect, it, vi } from "vitest";
import {
  addToCart,
  updateCartItemQuantity,
  removeFromCart,
  clearCart,
  getCart,
  checkoutCart,
} from "@server/lib/services/cart.service";

describe("Shopping cart service", () => {
  it("computes cart summary and item subtotals accurately", async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: [
                {
                  id: "item-1",
                  user_id: "user-1",
                  offer_id: "offer-1",
                  quantity: 2,
                  dynamic_fields: { player_id: "12345" },
                  created_at: "2026-10-12T00:00:00Z",
                  offers: {
                    id: "offer-1",
                    slug: "diamonds-100",
                    name_en: "100 Diamonds",
                    name_ar: "100 جوهرة",
                    price: 4.5,
                    currency: "USD",
                    is_active: true,
                    products: {
                      id: "prod-1",
                      slug: "free-fire",
                      name_en: "Free Fire",
                      name_ar: "فري فاير",
                      image_url: "https://example.com/ff.png",
                      is_active: true,
                      categories: { slug: "games" },
                    },
                  },
                },
                {
                  id: "item-2",
                  user_id: "user-1",
                  offer_id: "offer-2",
                  quantity: 1,
                  dynamic_fields: {},
                  created_at: "2026-10-12T00:01:00Z",
                  offers: {
                    id: "offer-2",
                    slug: "spotify-1m",
                    name_en: "1 Month",
                    name_ar: "شهر واحد",
                    price: 9.99,
                    currency: "USD",
                    is_active: true,
                    products: {
                      id: "prod-2",
                      slug: "spotify",
                      name_en: "Spotify",
                      name_ar: "سبوتيفاي",
                      image_url: null,
                      is_active: true,
                      categories: { slug: "streaming" },
                    },
                  },
                },
              ],
              error: null,
            }),
          }),
        }),
      }),
    };

    const cart = await getCart(mockSupabase as any, "user-1", "en");
    expect(cart.totalQuantity).toBe(3);
    // 2 * 4.5 + 1 * 9.99 = 9 + 9.99 = 18.99
    expect(cart.subtotal).toBe(18.99);
    expect(cart.items).toHaveLength(2);
    expect(cart.items[0].product.name).toBe("Free Fire");
    expect(cart.items[0].quantity).toBe(2);
  });

  it("caps added and updated quantities between 1 and 10", async () => {
    const upsertFn = vi.fn().mockResolvedValue({ error: null });
    const updateFn = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });

    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === "cart_items") {
          return { upsert: upsertFn, update: updateFn };
        }
        return {};
      }),
    };

    // Add with 99 quantity should cap to 10
    await addToCart(mockSupabase as any, "user-1", { offerId: "off-1", quantity: 99 });
    expect(upsertFn).toHaveBeenCalledWith(
      expect.objectContaining({ quantity: 10 }),
      expect.anything(),
    );

    // Update with 15 quantity should cap to 10
    await updateCartItemQuantity(mockSupabase as any, "user-1", "cart-item-1", 15);
    expect(updateFn).toHaveBeenCalledWith(expect.objectContaining({ quantity: 10 }));
  });

  it("removes cart item when quantity is reduced to 0", async () => {
    const deleteFn = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });

    const mockSupabase = {
      from: vi.fn().mockReturnValue({ delete: deleteFn }),
    };

    const res = await updateCartItemQuantity(mockSupabase as any, "user-1", "cart-item-1", 0);
    expect(res.ok).toBe(true);
    expect(deleteFn).toHaveBeenCalled();
  });

  it("refuses checkout when cart is empty", async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
      rpc: vi.fn().mockResolvedValue({ data: { allowed: true } }),
    };

    const res = await checkoutCart({
      userId: "user-1",
      sessionSupabase: mockSupabase as any,
      idempotencyKey: "idem-key",
      schedule: vi.fn(),
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe("cart_empty");
    }
  });

  it("calls place_cart_order RPC and schedules alerts and fulfillment on checkout", async () => {
    const scheduledPromises: Promise<unknown>[] = [];
    const schedule = vi.fn((p) => scheduledPromises.push(p));

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [{ offer_id: "off-1", quantity: 1, dynamic_fields: {} }],
            error: null,
          }),
        }),
      }),
      rpc: vi.fn((proc: string) => {
        if (proc === "check_velocity") {
          return Promise.resolve({ data: { allowed: true } });
        }
        if (proc === "place_cart_order") {
          return Promise.resolve({
            data: [
              {
                order_id: "order-1",
                order_number: "ORD-1001",
                total: 10.0,
                balance: 40.0,
              },
            ],
            error: null,
          });
        }
        return Promise.resolve({ data: null, error: null });
      }),
    };

    const res = await checkoutCart({
      userId: "user-1",
      sessionSupabase: mockSupabase as any,
      idempotencyKey: "idem-key-123",
      schedule,
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.orders).toHaveLength(1);
      expect(res.totalCharged).toBe(10.0);
      expect(res.remainingBalance).toBe(40.0);
    }
    expect(schedule).toHaveBeenCalled();
  });
});
