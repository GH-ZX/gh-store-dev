import { describe, expect, it } from "vitest";
import { buildStorePageMeta } from "../../storefront/app/lib/store-seo";
import { EMPTY_PUBLIC_SETTINGS } from "../../storefront/app/lib/settings/public-settings";
import { normalizePageSeo, resolvePageSeo } from "../../storefront/app/lib/settings/page-seo";

const settings = { ...EMPTY_PUBLIC_SETTINGS, branding: { nameAr: "متجر تجريبي", nameEn: "Example store", useEverywhere: true }, seo: { ...EMPTY_PUBLIC_SETTINGS.seo, descriptionEn: "Owner description", pages: { "/games": { titleAr: "", titleEn: "Owner catalog", descriptionAr: "", descriptionEn: "Catalog description" } } } };
const matches = [{ id: "root", loaderData: { seoSettings: settings } }];
describe("public page SEO", () => {
  it("reflects the saved home brand and description", () => {
    const meta = buildStorePageMeta({ locale: "en", title: "Default", description: "Default description" }, matches);
    expect(meta).toContainEqual({ title: "Example store" });
    expect(meta).toContainEqual({ name: "description", content: "Owner description" });
  });
  it("honors the owner's localized homepage SEO title before branding", () => {
    const customized = [{ id: "root", loaderData: { seoSettings: {
      ...settings,
      seo: { ...settings.seo, titleAr: "عنوان المتجر", titleEn: "Digital products and subscriptions" },
    } } }];
    expect(buildStorePageMeta({ locale: "en", title: "Default", description: "Default" }, customized))
      .toContainEqual({ title: "Digital products and subscriptions" });
    expect(buildStorePageMeta({ locale: "ar", title: "Default", description: "Default" }, customized))
      .toContainEqual({ title: "عنوان المتجر" });
  });
  it("uses the root deployment origin on pages without a separate site URL", () => {
    const meta = buildStorePageMeta(
      { locale: "en", path: "/products", title: "Products", description: "Catalog" },
      [{ id: "root", loaderData: { siteUrl: "https://shop.example/", seoSettings: settings } }],
    );
    expect(meta).toContainEqual({ tagName: "link", rel: "canonical", href: "https://shop.example/en/products" });
    expect(meta).toContainEqual({ tagName: "link", rel: "alternate", hrefLang: "ar", href: "https://shop.example/ar/products" });
  });
  it("uses localized page overrides while preserving locale-specific canonical routes", () => {
    const meta = buildStorePageMeta({ locale: "en", path: "/games", title: "Default", description: "Default description" }, matches);
    expect(meta).toContainEqual({ title: "Owner catalog" });
    expect(meta).toContainEqual({ tagName: "link", rel: "canonical", href: "https://gh-store.me/en/games" });
  });
  it("accepts SEO edits for the current products, best sellers, and about routes", () => {
    const pages = normalizePageSeo({
      "/products": { title_en: "Explore all digital products" },
      "/best-sellers": { title_en: "Popular digital offers" },
      "/about": { description_en: "Get to know GH Store" },
    });
    const fallback = { title: "Default", description: "Default description" };
    expect(resolvePageSeo(pages, "/products", "en", fallback).title).toBe("Explore all digital products");
    expect(resolvePageSeo(pages, "/best-sellers", "en", fallback).title).toBe("Popular digital offers");
    expect(resolvePageSeo(pages, "/about", "en", fallback).description).toBe("Get to know GH Store");
  });
});
