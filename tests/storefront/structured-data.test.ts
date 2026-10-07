import { describe, expect, it } from "vitest";
import {
  buildOfferListJsonLd,
  buildProductJsonLd,
  isMeaninglessOfferName,
  isPublishablePrice,
  structuredOfferName,
} from "@/lib/catalog/structured-data";

const PRODUCT = {
  slug: "mlbb",
  categorySlug: "games",
  name: "Mobile Legends",
  pointsName: "Diamonds",
};

describe("structured data never publishes a numeric-only offer name", () => {
  it("recognises a bare denomination, with or without the product's unit word", () => {
    for (const name of ["55", "86", "165", "330", " 1,200 ", "٣٣٠", ""]) {
      expect(isMeaninglessOfferName(name, "Diamonds")).toBe(true);
    }
    expect(isMeaninglessOfferName("55 Diamonds", "Diamonds")).toBe(true);
    expect(isMeaninglessOfferName("165 diamonds", "Diamonds")).toBe(true);
    // The Arabic unit the store actually renders for a diamond product.
    expect(isMeaninglessOfferName("55 ألماسة", "ألماسة")).toBe(true);
    // A real package name is left alone.
    expect(isMeaninglessOfferName("Weekly Elite Pack", "Diamonds")).toBe(false);
    expect(isMeaninglessOfferName("Monthly Elite Pack", "Diamonds")).toBe(false);
    expect(isMeaninglessOfferName("55 Diamond Pass", "Diamonds")).toBe(false);
  });

  it("names a bare amount by what it buys, with the live price attached", () => {
    const name = structuredOfferName({
      offerName: "55",
      productName: "Mobile Legends",
      pointsName: "Diamonds",
      price: 0.72,
      currency: "USD",
      locale: "en",
    });
    expect(name).toBe("Mobile Legends — 55, $0.72");
    expect(name).not.toBe("55");
  });

  it("keeps an informative supplier name and qualifies it with the product", () => {
    expect(structuredOfferName({
      offerName: "Weekly Elite Pack",
      productName: "Mobile Legends",
      pointsName: "Diamonds",
      price: 1.5,
      currency: "USD",
      locale: "en",
    })).toBe("Weekly Elite Pack — Mobile Legends");
  });

  it("emits a name, never a bare number, for every list item", () => {
    const data = buildOfferListJsonLd({
      locale: "ar",
      siteUrl: "https://gh-store.me",
      product: { slug: "mlbb", categorySlug: "games", name: "Mobile Legends", pointsName: "ألماسة" },
      offers: [
        { id: "1", slug: "55", name: "55 ألماسة", price: 0.72, currency: "USD" },
        { id: "2", slug: "86", name: "86 ألماسة", price: 1.1, currency: "USD" },
        { id: "3", slug: "weekly-elite-pack", name: "Weekly Elite Pack", price: 2.4, currency: "USD" },
      ],
    })!;

    const elements = data.itemListElement as { name: string; url: string; position: number }[];
    expect(elements).toHaveLength(3);
    for (const element of elements) {
      expect(element.name.trim()).not.toMatch(/^[\d\s.,]+$/);
      expect(element.name).toContain("Mobile Legends");
      expect(element.url).toContain("https://gh-store.me/ar/games/mlbb/");
    }
    expect(elements[0].name).toContain("55");
    expect(elements[0].name).toContain("0.72");
    expect(elements[2].name).toBe("Weekly Elite Pack — Mobile Legends");
  });

  it("keeps every list-item name unique", () => {
    const data = buildOfferListJsonLd({
      locale: "en",
      product: { slug: "mlbb", categorySlug: "games", name: "Mobile Legends", pointsName: "Diamonds" },
      offers: [
        { id: "1", slug: "weekly", name: "Weekly", price: 1, currency: "USD" },
        { id: "2", slug: "weekly-2", name: "Weekly", price: 2, currency: "USD" },
      ],
    })!;
    const names = (data.itemListElement as { name: string }[]).map((element) => element.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("describes the product with only the prices the catalog can prove", () => {
    const data = buildProductJsonLd({
      locale: "en",
      siteUrl: "https://gh-store.me",
      product: { ...PRODUCT, description: "Diamond top-up", categoryName: "Games" },
      offers: [
        { id: "1", slug: "55", name: "55", price: 0.72, currency: "USD" },
        { id: "2", slug: "330", name: "330", price: 4.3, currency: "USD" },
      ],
      imageUrl: "https://api.g2bulk.com/images/mlbb.png",
    })!;

    expect(data).toMatchObject({
      "@type": "Product",
      name: "Mobile Legends",
      category: "Games",
      offers: {
        "@type": "AggregateOffer",
        priceCurrency: "USD",
        lowPrice: 0.72,
        highPrice: 4.3,
        offerCount: 2,
      },
    });
    // Availability is deliberately absent: the supplier is not consulted here.
    expect(JSON.stringify(data)).not.toContain("availability");
  });

  it("omits an offer block entirely when no price is publishable", () => {
    expect(buildProductJsonLd({
      locale: "en",
      product: PRODUCT,
      offers: [{ id: "1", slug: "x", name: "x", price: Number.NaN, currency: "unknown" }],
    })).toBeNull();
    expect(buildOfferListJsonLd({ locale: "en", product: PRODUCT, offers: [] })).toBeNull();
  });

  it("accepts only a finite, three-letter-currency amount", () => {
    expect(isPublishablePrice(0, "USD")).toBe(true);
    expect(isPublishablePrice(12.5, "TRY")).toBe(true);
    expect(isPublishablePrice(Number.NaN, "USD")).toBe(false);
    expect(isPublishablePrice(Number.POSITIVE_INFINITY, "USD")).toBe(false);
    expect(isPublishablePrice(-1, "USD")).toBe(false);
    expect(isPublishablePrice(1, "usd")).toBe(false);
    expect(isPublishablePrice(1, "US")).toBe(false);
  });
});
