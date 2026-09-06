import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), settings: vi.fn(), save: vi.fn(), recharge: vi.fn(), revalidate: vi.fn(), client: {} }));
vi.mock("@server/lib/auth/guards", () => ({ requireAdmin: mocks.admin }));
vi.mock("@server/lib/services/admin-website.service", () => ({ getWebsiteSettings: mocks.settings, saveHomeLayout: mocks.save }));
vi.mock("@server/lib/services/admin-recharge.service", () => ({ saveRechargeSettings: mocks.recharge }));
vi.mock("@server/lib/supabase/server", () => ({ createSupabaseServerClient: async () => mocks.client }));
vi.mock("@server/compat/cache", () => ({ revalidatePath: mocks.revalidate }));
import { saveHomeSectionCopyAction, saveRechargeMethodsAction } from "../../storefront/app/.server/legacy/lib/live-edit/actions";
const initial = { error: null, notice: null };
function form(fields: Record<string, string>) { const form = new FormData(); for (const [key, value] of Object.entries(fields)) form.set(key, value); return form; }
beforeEach(() => { mocks.admin.mockResolvedValue({ id: "admin" }); mocks.save.mockResolvedValue(undefined); mocks.recharge.mockResolvedValue(undefined); });
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
});
