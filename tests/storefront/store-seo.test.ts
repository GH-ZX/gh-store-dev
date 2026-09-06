import { describe, expect, it } from "vitest";
import { buildStorePageMeta } from "../../storefront/app/lib/store-seo";
import { EMPTY_PUBLIC_SETTINGS } from "../../storefront/app/lib/settings/public-settings";

const settings = { ...EMPTY_PUBLIC_SETTINGS, branding: { nameAr: "متجر تجريبي", nameEn: "Example store", useEverywhere: true }, seo: { ...EMPTY_PUBLIC_SETTINGS.seo, descriptionEn: "Owner description", pages: { "/games": { titleAr: "", titleEn: "Owner catalog", descriptionAr: "", descriptionEn: "Catalog description" } } } };
const matches = [{ id: "root", loaderData: { seoSettings: settings } }];
describe("public page SEO", () => {
  it("reflects the saved home brand and description", () => {
    const meta = buildStorePageMeta({ locale: "en", title: "Default", description: "Default description" }, matches);
    expect(meta).toContainEqual({ title: "متجر تجريبي" });
    expect(meta).toContainEqual({ name: "description", content: "Owner description" });
  });
  it("uses localized page overrides while preserving locale-specific canonical routes", () => {
    const meta = buildStorePageMeta({ locale: "en", path: "/games", title: "Default", description: "Default description" }, matches);
    expect(meta).toContainEqual({ title: "Owner catalog" });
    expect(meta).toContainEqual({ tagName: "link", rel: "canonical", href: "https://gh-store.me/en/games" });
  });
});
