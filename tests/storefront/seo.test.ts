import { describe, expect, it } from "vitest";
import {
  buildAbsoluteUrl,
  buildBreadcrumbJsonLd,
  buildCatalogDescription,
  buildCollectionDescription,
  buildOfferJsonLd,
  buildOrganizationJsonLd,
  buildPageMeta,
  getSiteUrl,
} from "@/lib/seo";

describe("canonical URLs and share metadata", () => {
  it("uses a valid deployment origin and removes accidental URL suffixes", () => {
    expect(getSiteUrl({ APP_URL: " https://shop.example/en/?campaign=owner " })).toBe("https://shop.example");
    expect(getSiteUrl({ APP_URL: "not a URL" })).toBe("https://gh-store.me");
    expect(getSiteUrl({ APP_URL: "javascript:alert(1)" })).toBe("https://gh-store.me");
    expect(getSiteUrl({ APP_URL: "https://user:password@example.com" })).toBe("https://gh-store.me");
    expect(buildAbsoluteUrl("en", "/products/?campaign=spring#offers", "https://shop.example/"))
      .toBe("https://shop.example/en/products");
  });

  it("encodes multilingual paths while preserving already encoded slugs", () => {
    expect(buildAbsoluteUrl("ar", "/products/بطاقة"))
      .toBe("https://gh-store.me/ar/products/%D8%A8%D8%B7%D8%A7%D9%82%D8%A9");
    expect(buildAbsoluteUrl("en", "/products/gift%20card"))
      .toBe("https://gh-store.me/en/products/gift%20card");
  });

  it("keeps localized canonicals and reciprocal language links aligned", () => {
    const meta = buildPageMeta({ locale: "en", path: "/products", title: "Products", description: "Browse offers" });
    expect(meta).toContainEqual({ tagName: "link", rel: "canonical", href: "https://gh-store.me/en/products" });
    for (const [locale, target] of [["ar", "ar"], ["en", "en"], ["x-default", "ar"]]) {
      expect(meta).toContainEqual({ tagName: "link", rel: "alternate", hrefLang: locale, href: `https://gh-store.me/${target}/products` });
    }
    expect(meta).toContainEqual({ name: "robots", content: "max-image-preview:large" });
  });

  it("gives paginated collections their own canonical and translated page links", () => {
    const meta = buildPageMeta({ locale: "en", path: "/products?campaign=spring", page: 3, title: "Products", description: "Catalog" });
    expect(meta).toContainEqual({ title: "Products — Page 3" });
    expect(meta).toContainEqual({ tagName: "link", rel: "canonical", href: "https://gh-store.me/en/products?page=3" });
    expect(meta).toContainEqual({ tagName: "link", rel: "alternate", hrefLang: "ar", href: "https://gh-store.me/ar/products?page=3" });
    expect(meta).toContainEqual({ tagName: "link", rel: "alternate", hrefLang: "x-default", href: "https://gh-store.me/ar/products?page=3" });
    expect(meta).toContainEqual({ property: "og:url", content: "https://gh-store.me/en/products?page=3" });
    expect(meta).not.toContainEqual({ name: "robots", content: "noindex, follow" });
  });

  it("canonicalizes first pages and invalid pagination values to the collection root", () => {
    for (const page of [1, 0, -2, 2.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const meta = buildPageMeta({ locale: "ar", path: "/products", page, title: "المنتجات", description: "الكتالوج" });
      expect(meta).toContainEqual({ tagName: "link", rel: "canonical", href: "https://gh-store.me/ar/products" });
      expect(meta).toContainEqual({ title: "المنتجات" });
    }
  });

  it("makes share image URLs absolute with a useful image description", () => {
    const meta = buildPageMeta({ locale: "en", title: "Gift card", description: "Product", imageUrl: "/card.png", siteUrl: "https://shop.example/" });
    expect(meta).toContainEqual({ property: "og:image", content: "https://shop.example/card.png" });
    expect(meta).toContainEqual({ property: "og:image:alt", content: "Gift card" });
    expect(meta).toContainEqual({ name: "twitter:card", content: "summary_large_image" });
    const invalid = buildPageMeta({ locale: "en", title: "Gift card", description: "Product", imageUrl: "data:image/png;base64,broken" });
    expect(invalid).toContainEqual({ name: "twitter:card", content: "summary" });
    expect(invalid.some((entry) => "property" in entry && entry.property === "og:image")).toBe(false);
  });

  it("keeps internal search out of the index while allowing link discovery", () => {
    expect(buildPageMeta({ locale: "en", path: "/search", title: "Search", description: "Search", noIndex: true }))
      .toContainEqual({ name: "robots", content: "noindex, follow" });
  });
});

describe("catalog structured data", () => {
  const product = {
    slug: "gift-card", categorySlug: "vouchers", name: "Gift card",
    description: null, imageUrl: "/card.png", logoUrl: null,
  };
  const offer = {
    id: "offer-123", slug: "50-usd", name: "$50 credit", description: null,
    imageUrl: null, price: 47.5, currency: "USD", supplierCostUsd: 40,
  };

  it("uses localized catalog descriptions instead of empty search snippets", () => {
    expect(buildCatalogDescription({ locale: "en", productName: "Gift card" }))
      .toContain("Browse Gift card offers at GH Store");
    expect(buildCatalogDescription({ locale: "ar", productName: "Gift card" }))
      .toContain("تصفّح عروض Gift card");
    expect(buildCatalogDescription({ locale: "en", productName: "Gift card", description: "  Existing\n description  " }))
      .toBe("Existing description");
    expect(buildCatalogDescription({ locale: "en", productName: "Gift card", description: "Product details", offerDescription: "Specific package details" }))
      .toBe("Specific package details");
  });

  it("provides category-specific descriptions when category content is absent", () => {
    expect(buildCollectionDescription({ locale: "en", categoryName: "AI" })).toContain("Browse AI products and offers");
    expect(buildCollectionDescription({ locale: "ar", categoryName: "AI" })).toContain("تصفّح منتجات وعروض AI");
    expect(buildCollectionDescription({ locale: "en", categoryName: "AI", description: "  Existing category content  " }))
      .toBe("Existing category content");
  });

  it("describes the selected sellable package using public price data", () => {
    const data = buildOfferJsonLd({ locale: "en", siteUrl: "https://shop.example/", product, offer });
    expect(data).toMatchObject({
      "@type": "Product",
      name: "$50 credit — Gift card",
      sku: "offer-123",
      url: "https://shop.example/en/vouchers/gift-card/50-usd",
      image: ["https://shop.example/card.png"],
      offers: {
        "@type": "Offer", price: 47.5, priceCurrency: "USD",
        seller: { "@id": "https://shop.example/#organization" },
      },
    });
    expect(data).not.toHaveProperty("aggregateRating");
    expect(data).not.toHaveProperty("offers.availability");
    expect(JSON.stringify(data)).not.toContain("supplierCost");
  });

  it("does not publish invalid catalog prices or currency codes", () => {
    for (const invalid of [{ price: Number.NaN }, { price: -1 }, { currency: "unknown" }]) {
      expect(buildOfferJsonLd({ locale: "en", product, offer: { ...offer, ...invalid } })).not.toHaveProperty("offers");
    }
  });

  it("publishes the visible breadcrumb hierarchy with localized URLs", () => {
    expect(buildBreadcrumbJsonLd({ locale: "en", items: [
      { name: "Home", path: "" }, { name: "Products", path: "/products" }, { name: "Gift card", path: "/products/gift-card" },
    ] })).toMatchObject({
      "@type": "BreadcrumbList",
      itemListElement: [
        { position: 1, name: "Home", item: "https://gh-store.me/en" },
        { position: 2, name: "Products", item: "https://gh-store.me/en/products" },
        { position: 3, name: "Gift card", item: "https://gh-store.me/en/products/gift-card" },
      ],
    });
  });

  it("identifies the online store without claiming physical premises", () => {
    expect(buildOrganizationJsonLd("https://shop.example/", "Example store")).toEqual([
      {
        "@context": "https://schema.org", "@type": "OnlineStore", "@id": "https://shop.example/#organization",
        name: "Example store", url: "https://shop.example", logo: "https://shop.example/gh-store-logo-mark.png",
      },
      {
        "@context": "https://schema.org", "@type": "WebSite", "@id": "https://shop.example/#website",
        name: "Example store", url: "https://shop.example", inLanguage: ["ar", "en"], publisher: { "@id": "https://shop.example/#organization" },
      },
    ]);
  });
});
