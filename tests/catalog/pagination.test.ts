import { describe, expect, it } from "vitest";
import { CATALOG_PAGE_SIZE, catalogPageRange, toCatalogPage } from "@/lib/catalog/pagination";

describe("catalog pagination", () => {
  it("keeps public listing pages bounded", () => {
    expect(CATALOG_PAGE_SIZE).toBe(12);
    expect(catalogPageRange(1)).toEqual({ from: 0, to: 11 });
    expect(catalogPageRange(3)).toEqual({ from: 24, to: 35 });
  });

  it("reports navigation metadata from the exact total", () => {
    const page = toCatalogPage(["a", "b"], 2, 26);

    expect(page).toEqual({
      items: ["a", "b"],
      page: 2,
      pages: 3,
      total: 26,
      hasPrevious: true,
      hasNext: true,
    });
  });

  it("keeps an empty catalog on one page", () => {
    expect(toCatalogPage([], 1, 0)).toMatchObject({
      pages: 1,
      total: 0,
      hasPrevious: false,
      hasNext: false,
    });
  });
});
