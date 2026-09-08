import { createRequire } from "node:module";
import type { ComponentProps, ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";

const data = vi.hoisted(() => ({
  locale: "en",
  filters: { query: "", category: "", publishedOnly: false },
  providerCategories: [],
  products: [{
    id: "11111111-1111-4111-8111-111111111111",
    slug: "test-product", nameEn: "Test product", nameAr: "منتج تجريبي",
    imageUrl: null, isActive: true, isFeatured: false, showInCarousel: false,
    offerCount: 2, activeOfferCount: 1, providerCode: "test", providerUrl: "https://supplier.example/product",
  }],
}));

vi.mock("../../storefront/node_modules/react-router/dist/development/index.js", async (original) => {
  const actual = await original<typeof import("../../storefront/node_modules/react-router/dist/development/index.js")>();
  const { createRequire } = await import("node:module");
  const { createElement } = createRequire(new URL("../../storefront/package.json", import.meta.url))("react") as typeof import("react");
  return {
    ...actual,
    useLoaderData: () => data,
    Link: ({ to, children, ...props }: Omit<ComponentProps<"a">, "href"> & { to: string; children?: ReactNode }) => createElement("a", { href: to, ...props }, children),
  };
});

import CatalogPage from "../../storefront/app/routes/dashboard-catalog";
const requireApp = createRequire(new URL("../../storefront/package.json", import.meta.url));
const { createElement } = requireApp("react") as typeof import("react");
const { renderToStaticMarkup } = requireApp("react-dom/server") as typeof import("react-dom/server");

it("renders independent supplier and editor links without nested anchors", () => {
  const markup = renderToStaticMarkup(createElement(CatalogPage));
  let open = false;
  for (const tag of markup.match(/<\/?a\b[^>]*>/g) ?? []) {
    if (tag.startsWith("</")) open = false;
    else {
      expect(open, "A supplier link must not be inside a catalog edit link").toBe(false);
      open = true;
    }
  }
  expect(markup).toContain('href="https://supplier.example/product"');
  expect(markup).toContain('href="/en/dashboard/catalog/11111111-1111-4111-8111-111111111111"');
  expect(markup).toContain("Edit: Test product");
});


beforeEach(() => { data.products[0].activeOfferCount = 1; });

it("flags products with only inactive offers even when the total offer count is positive", () => {
  data.products[0].activeOfferCount = 0;
  const markup = renderToStaticMarkup(createElement(CatalogPage));
  expect(markup).toContain("No active offers");
});

it("does not warn about products that have an active offer", () => {
  const markup = renderToStaticMarkup(createElement(CatalogPage));
  expect(markup).not.toContain("No active offers");
});
