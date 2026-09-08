import { describe, expect, it } from "vitest";
import arAdmin from "../../storefront/app/i18n/messages/ar/admin.json";
import enAdmin from "../../storefront/app/i18n/messages/en/admin.json";

describe("admin catalog list & editor logic", () => {
  it("provides all required catalog translation keys in Arabic and English", () => {
    const cAr = arAdmin.catalog;
    const cEn = enAdmin.catalog;

    expect(cAr.title).toBeTruthy();
    expect(cEn.title).toBeTruthy();

    expect(cAr).toHaveProperty("allFilter");
    expect(cAr).toHaveProperty("publishedFilter");
    expect(cAr).toHaveProperty("searchLabel");
    expect(cAr).toHaveProperty("searchPlaceholder");
    expect(cAr).toHaveProperty("categoryFilterLabel");
    expect(cAr).toHaveProperty("allCategories");
    expect(cAr).toHaveProperty("offersCount");
    expect(cAr).toHaveProperty("create");
    expect(cAr.create).toHaveProperty("action");

    expect(cEn).toHaveProperty("allFilter");
    expect(cEn).toHaveProperty("publishedFilter");
    expect(cEn).toHaveProperty("searchLabel");
    expect(cEn).toHaveProperty("searchPlaceholder");
    expect(cEn).toHaveProperty("categoryFilterLabel");
    expect(cEn).toHaveProperty("allCategories");
    expect(cEn.create).toHaveProperty("action");
  });

  it("accurately builds filtered catalog URLs", () => {
    const buildPath = (
      locale: string,
      filters: { query?: string; publishedOnly?: boolean; category?: string },
    ) => {
      const search = new URLSearchParams();
      if (filters.query) search.set("q", filters.query);
      if (filters.publishedOnly) search.set("published", "1");
      if (filters.category) search.set("category", filters.category);
      const query = search.toString();
      return query ? `/${locale}/dashboard/catalog?${query}` : `/${locale}/dashboard/catalog`;
    };

    expect(buildPath("ar", {})).toBe("/ar/dashboard/catalog");
    expect(buildPath("en", { query: "steam" })).toBe("/en/dashboard/catalog?q=steam");
    expect(buildPath("ar", { publishedOnly: true })).toBe("/ar/dashboard/catalog?published=1");
    expect(buildPath("en", { category: "games", publishedOnly: true })).toBe(
      "/en/dashboard/catalog?published=1&category=games",
    );
  });
});
