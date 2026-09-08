import { createRequire } from "node:module";
import type { ComponentProps, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { StoreProduct } from "@/lib/catalog/product-mapper";
import type { StoreOffer } from "@/lib/catalog/offer-mapper";

vi.mock("../../storefront/node_modules/react-router/dist/development/index.js", async (original) => {
  const actual = await original<typeof import("../../storefront/node_modules/react-router/dist/development/index.js")>();
  const { createRequire } = await import("node:module");
  const { createElement } = createRequire(new URL("../../storefront/package.json", import.meta.url))("react") as typeof import("react");
  return {
    ...actual,
    Link: ({ to, children, ...props }: Omit<ComponentProps<"a">, "href"> & { to: string; children?: ReactNode }) => createElement("a", { href: to, ...props }, children),
  };
});

import { DetailPurchaseSummary, ProductDetailHeader, RelatedProductDiscovery } from "@/components/store/product-detail";
import { ProductOfferSelection } from "@/components/store/product-offer-selection";
const requireApp = createRequire(new URL("../../storefront/package.json", import.meta.url));
const { createElement } = requireApp("react") as typeof import("react");
const { renderToStaticMarkup } = requireApp("react-dom/server") as typeof import("react-dom/server");
const product = {
  id: "product", slug: "assistant", name: "Assistant", categorySlug: "ai", categoryName: "AI",
  kind: "subscription", description: null, imageUrl: "/assistant.png", logoUrl: null,
  carouselLogoTone: null, isFeatured: false,
} as StoreProduct;
const offer = {
  id: "offer", slug: "monthly", name: "Monthly", price: 12, currency: "USD", originalPrice: null,
  description: null, imageUrl: null, regionCode: null,
} as StoreOffer;

describe("product detail presentation", () => {
  it("keeps full artwork framed and distinguishes the actual product from its offer", () => {
    const productMarkup = renderToStaticMarkup(createElement(ProductDetailHeader, { locale: "en", product, offers: [offer] }));
    expect(productMarkup).toContain('data-artwork-fit="contain"');
    expect(productMarkup).toContain("<h1><bdi>Assistant</bdi></h1>");
    const offerMarkup = renderToStaticMarkup(createElement(ProductDetailHeader, { locale: "en", product, offers: [offer], offer }));
    expect(offerMarkup).toContain("<h1><bdi>Monthly</bdi></h1>");
    expect(offerMarkup).toContain('href="/en/ai/assistant"');
    expect(offerMarkup).toContain("$12.00");
  });

  it.each(["en", "ar"] as const)("gives the %s no-offer state working discovery actions without an empty checkout summary", (locale) => {
    const markup = renderToStaticMarkup(createElement(ProductOfferSelection, { locale, product, offers: [] }));
    expect(markup).toContain(`href="/${locale}/products"`);
    expect(markup).toContain(`href="/${locale}/contact"`);
    expect(markup).not.toContain("/checkout/");
    expect(markup).not.toContain("purchase-summary-heading");
  });

  it("only links checkout to the visible initial offer and provides its detail page", () => {
    const markup = renderToStaticMarkup(createElement(ProductOfferSelection, { locale: "en", product, offers: [offer] }));
    expect(markup).toContain('name="selected-offer" checked="" value="offer"');
    expect(markup).toContain('href="/en/checkout/assistant/monthly"');
    expect(markup).toContain('href="/en/ai/assistant/monthly"');
  });

  it("preserves localized slugs as individual checkout path segments", () => {
    const localizedProduct = { ...product, slug: "اشتراك خاص" };
    const localizedOffer = { ...offer, slug: "3+months" };
    const markup = renderToStaticMarkup(createElement(DetailPurchaseSummary, { locale: "ar", product: localizedProduct, offer: localizedOffer }));
    expect(markup).toContain(`href="/ar/checkout/${encodeURIComponent(localizedProduct.slug)}/${encodeURIComponent(localizedOffer.slug)}"`);
  });

  it("labels catalog fallback neutrally and omits unavailable discovery entirely", () => {
    const empty = renderToStaticMarkup(createElement(RelatedProductDiscovery, { locale: "en", product, related: { products: [], scope: "catalog" } }));
    expect(empty).toBe("");
    const markup = renderToStaticMarkup(createElement(RelatedProductDiscovery, { locale: "en", product, related: { products: [product], scope: "catalog" } }));
    expect(markup).toContain("Explore other products");
    expect(markup).not.toContain("More in this category");
  });
});
