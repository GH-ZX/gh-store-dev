import { describe, expect, it, vi } from "vitest";
import {
  addToWishlist,
  removeFromWishlist,
  isProductWishlisted,
  getWishlist,
} from "@server/lib/services/wishlist.service";

describe("Wishlist / Favorites service", () => {
  it("adds a product to user wishlist", async () => {
    const upsertFn = vi.fn().mockResolvedValue({ error: null });
    const mockSupabase = {
      from: vi.fn().mockReturnValue({ upsert: upsertFn }),
    };

    const res = await addToWishlist(mockSupabase as any, "user-1", "prod-100");
    expect(res.ok).toBe(true);
    expect(upsertFn).toHaveBeenCalledWith(
      { user_id: "user-1", product_id: "prod-100" },
      { onConflict: "user_id,product_id" },
    );
  });

  it("removes a product from user wishlist", async () => {
    const deleteFn = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });
    const mockSupabase = {
      from: vi.fn().mockReturnValue({ delete: deleteFn }),
    };

    const res = await removeFromWishlist(mockSupabase as any, "user-1", "prod-100");
    expect(res.ok).toBe(true);
    expect(deleteFn).toHaveBeenCalled();
  });

  it("checks whether a product is wishlisted", async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { id: "wishlist-1" }, error: null }),
            }),
          }),
        }),
      }),
    };

    const wishlisted = await isProductWishlisted(mockSupabase as any, "user-1", "prod-100");
    expect(wishlisted).toBe(true);
  });

  it("maps wishlisted products with localized details", async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: [
                {
                  product_id: "prod-1",
                  created_at: "2026-10-12T00:00:00Z",
                  products: {
                    id: "prod-1",
                    slug: "netflix",
                    name_en: "Netflix",
                    name_ar: "نتفليكس",
                    description_en: "Streaming service",
                    description_ar: "خدمة بث",
                    points_name_ar: null,
                    points_name_en: null,
                    image_url: "https://example.com/netflix.png",
                    logo_url: null,
                    thumbnail_url: null,
                    is_featured: true,
                    product_kind: "subscription",
                    carousel_badge_ar: null,
                    carousel_badge_en: null,
                    carousel_focus_x: null,
                    carousel_focus_y: null,
                    carousel_color: null,
                    carousel_logo_tone: null,
                    categories: { slug: "streaming", name_en: "Streaming", name_ar: "البث" },
                  },
                },
              ],
              error: null,
            }),
          }),
        }),
      }),
    };

    const list = await getWishlist(mockSupabase as any, "user-1", "ar");
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("نتفليكس");
    expect(list[0].categorySlug).toBe("streaming");
  });
});
