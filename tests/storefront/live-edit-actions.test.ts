import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  settings: vi.fn(),
  save: vi.fn(),
  recharge: vi.fn(),
  revalidate: vi.fn(),
  client: {},
  getProduct: vi.fn(),
  updateProduct: vi.fn(),
}));
vi.mock("@server/lib/auth/guards", () => ({ requireAdmin: mocks.admin }));
vi.mock("@server/lib/services/admin-website.service", () => ({ getWebsiteSettings: mocks.settings, saveHomeLayout: mocks.save }));
vi.mock("@server/lib/services/admin-recharge.service", () => ({ saveRechargeSettings: mocks.recharge }));
vi.mock("@server/lib/supabase/server", () => ({ createSupabaseServerClient: async () => mocks.client }));
vi.mock("@server/compat/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@server/legacy/lib/services/admin-catalog.service", () => ({
  getAdminProduct: mocks.getProduct,
  updateAdminProduct: mocks.updateProduct,
}));
import {
  saveHomeSectionCopyAction,
  saveProductPresentationAction,
  saveRechargeMethodsAction,
} from "../../storefront/app/.server/legacy/lib/live-edit/actions";
const initial = { error: null, notice: null };
function form(fields: Record<string, string>) { const form = new FormData(); for (const [key, value] of Object.entries(fields)) form.set(key, value); return form; }
beforeEach(() => {
  mocks.admin.mockResolvedValue({ id: "admin" });
  mocks.save.mockResolvedValue(undefined);
  mocks.recharge.mockResolvedValue(undefined);
  mocks.getProduct.mockReset();
  mocks.updateProduct.mockReset();
});
describe("inline edit and provider method actions", () => {
  it("changes only the targeted section while keeping its product selection", async () => {
    const selected = { id: "selected", titleAr: "Old", titleEn: "Old", subtitleAr: "", subtitleEn: "", enabled: true, limit: 8, productIds: ["product-one"], kind: "handpicked" };
    const other = { ...selected, id: "other", titleEn: "Untouched" };
    mocks.settings.mockResolvedValue({ sections: [selected, other] });
    expect(await saveHomeSectionCopyAction(initial, form({ section_id: "selected", title_en: "New", enabled: "on", limit: "6" }))).toEqual({ error: null, notice: "saved" });
    const saved = mocks.save.mock.calls[0][0];
    expect(saved[0]).toMatchObject({ titleEn: "New", titleAr: "Old", productIds: ["product-one"], kind: "handpicked", limit: 6 });
    expect(saved[1]).toEqual(other);
  });
  it("does not recreate a section removed while its editor was open", async () => {
    mocks.settings.mockResolvedValue({ sections: [] });
    expect(await saveHomeSectionCopyAction(initial, form({ section_id: "removed" }))).toEqual({ error: "not_found", notice: null });
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("rejects duplicate recharge method identifiers without a partial write", async () => {
    const method = { id: "manual", label_en: "Manual", enabled: false };
    expect(await saveRechargeMethodsAction(initial, form({ methods: JSON.stringify([method, method]) }))).toEqual({ error: "invalid_input", notice: null });
    expect(mocks.recharge).not.toHaveBeenCalled();
  });
  it("saves the complete validated methods list with the request client", async () => {
    expect(await saveRechargeMethodsAction(initial, form({ methods: JSON.stringify([{ id: "manual", label_en: "Manual", enabled: false }]) }))).toEqual({ error: null, notice: "methods_saved" });
    expect(mocks.admin).toHaveBeenCalledOnce();
    expect(mocks.recharge.mock.calls[0][0]).toBe(mocks.client);
    expect(mocks.recharge.mock.calls[0][1].methods).toHaveLength(1);
    expect(mocks.revalidate).toHaveBeenCalled();
  });

  it("saves product presentation with long descriptions, long URLs, and custom badges", async () => {
    const longDescription = "A".repeat(1200);
    const longUrl = "https://example.com/images/" + "x".repeat(700) + ".png";

    mocks.getProduct.mockResolvedValue({
      game: {
        id: "prod-1",
        nameAr: "الاسم",
        nameEn: "Name",
        descriptionAr: null,
        descriptionEn: null,
        imageUrl: null,
        logoUrl: null,
        isFeatured: false,
        showInCarousel: false,
      },
    });

    const result = await saveProductPresentationAction(
      initial,
      form({
        game_id: "prod-1",
        name_ar: "منتج تجريبي",
        name_en: "Test Product",
        description_ar: longDescription,
        description_en: longDescription,
        image_url: longUrl,
        logo_url: longUrl,
        carousel_badge_ar: "شارة مميزة",
        carousel_badge_en: "Featured Badge",
        carousel_color: "#10b981",
        carousel_logo_tone: "light",
        is_featured: "on",
        show_in_carousel: "on",
      }),
    );

    expect(result).toEqual({ error: null, notice: "saved" });
    expect(mocks.updateProduct).toHaveBeenCalledWith("prod-1", expect.objectContaining({
      nameAr: "منتج تجريبي",
      nameEn: "Test Product",
      descriptionAr: longDescription,
      descriptionEn: longDescription,
      imageUrl: longUrl,
      logoUrl: longUrl,
      carouselBadgeAr: "شارة مميزة",
      carouselBadgeEn: "Featured Badge",
      carouselColor: "#10b981",
      carouselLogoTone: "light",
      isFeatured: true,
      showInCarousel: true,
    }));
  });

  it("falls back between name_ar and name_en if one is omitted", async () => {
    mocks.getProduct.mockResolvedValue({
      game: {
        id: "prod-2",
        nameAr: "قديم",
        nameEn: "Old",
      },
    });

    const result = await saveProductPresentationAction(
      initial,
      form({
        game_id: "prod-2",
        name_ar: "منتج فقط بالعربية",
      }),
    );

    expect(result).toEqual({ error: null, notice: "saved" });
    expect(mocks.updateProduct).toHaveBeenCalledWith("prod-2", expect.objectContaining({
      nameAr: "منتج فقط بالعربية",
      nameEn: "منتج فقط بالعربية",
    }));
  });
});
