import { beforeEach, describe, expect, it, vi } from "vitest";

const test = vi.hoisted(() => ({
  row: {} as Record<string, unknown>,
  updates: [] as Record<string, unknown>[],
  requireAdmin: vi.fn(),
  clearCache: vi.fn(),
}));
vi.mock("@server/lib/auth/guards", () => ({ requireAdmin: test.requireAdmin }));
vi.mock("@server/lib/cache", () => ({ clearCache: test.clearCache }));
vi.mock("@server/lib/logging/logger", () => ({ logFailure: vi.fn() }));
vi.mock("@server/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({ data: test.row, error: null }),
        update: (patch: Record<string, unknown>) => {
          test.updates.push(patch);
          test.row = { ...test.row, ...patch };
          return query;
        },
        single: async () => ({ data: { id: "global" }, error: null }),
      };
      return query;
    },
  }),
}));

import { createHomeSection } from "@/lib/home/layout";
import { getWebsiteSettings, saveHomeLayout } from "@server/lib/services/admin-website.service";
import { saveBrandingAction, saveHomeLayoutAction, savePageSeoAction, saveSocialLinksAction, saveThemeAction } from "@server/website-actions";

const initial = { error: null, notice: null };
const form = (fields: Record<string, string>) => {
  const result = new FormData();
  for (const [name, value] of Object.entries(fields)) result.set(name, value);
  return result;
};

beforeEach(() => {
  test.row = { home_layout: [], social_links: [], seo: {}, contact: {}, theme: {}, branding: {} };
  test.updates.length = 0;
  test.requireAdmin.mockReset().mockResolvedValue({ id: "admin" });
});

describe("migrated website settings mutations", () => {
  it("preserves selected categories through storage and the public normalizer", async () => {
    const section = { ...createHomeSection("category", "selected"), categoryIds: ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"] };
    await saveHomeLayout([section]);
    expect(test.updates[0]).toMatchObject({ home_layout: [{ category_ids: ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"] }] });
    expect((await getWebsiteSettings()).sections[0].categoryIds).toEqual(["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"]);
  });

  it("preserves selected products through storage and the public normalizer", async () => {
    const id = "33333333-3333-4333-8333-333333333333";
    await saveHomeLayout([{ ...createHomeSection("product_picks", "picks"), productIds: [id] }]);
    expect((await getWebsiteSettings()).sections[0].productIds).toEqual([id]);
  });

  it("changes only branding and preserves unrelated stored branding keys", async () => {
    test.row.branding = { future_setting: "retained" };
    await saveBrandingAction(initial, form({ name_en: "New store" }));
    expect(test.updates[0]).toEqual({ branding: { future_setting: "retained", name_ar: "", name_en: "New store", use_everywhere: false, show_logo: false } });
  });

  it("keeps carousel settings when the homepage layout is saved", async () => {
    await saveHomeLayout([{ ...createHomeSection("carousel", "hero"), intervalSeconds: 12, imageFit: "contain", imagePositionX: 25 }]);
    const result = await saveHomeLayoutAction(initial, form({
      "sections.0.id": "hero", "sections.0.type": "carousel", "sections.0.enabled": "on", "sections.0.title_en": "New title",
    }));
    expect(result).toEqual({ error: null, notice: "saved" });
    expect((await getWebsiteSettings()).sections[0]).toMatchObject({ titleEn: "New title", intervalSeconds: 12, imageFit: "contain", imagePositionX: 25 });
  });

  it("rejects malformed colours and unsafe social URLs before writing", async () => {
    expect(await saveThemeAction(initial, form({ accent: "bad" }))).toEqual({ error: "invalid_colour", notice: null });
    expect(await saveSocialLinksAction(initial, form({ "links.0.platform": "website", "links.0.url": "javascript:alert(1)" }))).toEqual({ error: "invalid_url", notice: null });
    expect(test.updates).toHaveLength(0);
  });

  it("updates one page listing without erasing other SEO settings", async () => {
    test.row.seo = { title_en: "Store", pages: { "/faq": { title_en: "Help" } } };
    await savePageSeoAction(initial, form({ path: "/contact", title_en: "Contact us" }));
    expect(test.row.seo).toMatchObject({ title_en: "Store", pages: { "/faq": { title_en: "Help" }, "/contact": { title_en: "Contact us" } } });
    expect(test.clearCache).toHaveBeenCalled();
  });

  it("requires admin authorization before a settings write", async () => {
    test.requireAdmin.mockRejectedValue(new Error("Forbidden"));
    await expect(saveBrandingAction(initial, form({ name_en: "Changed" }))).rejects.toThrow("Forbidden");
    expect(test.updates).toHaveLength(0);
  });
});
