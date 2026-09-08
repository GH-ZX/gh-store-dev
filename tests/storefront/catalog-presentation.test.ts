import { describe, expect, it } from "vitest";
import { artworkMonogram, getImageAttempts, getOfferArtwork, getProductArtwork } from "@/lib/catalog/presentation";

describe("catalog artwork choices", () => {
  const product = { imageUrl: "/product.webp", logoUrl: "/logo.svg", kind: "game" as const, carouselLogoTone: "light" as const };

  it("fills game scenery without applying the logo's monochrome setting to it", () => {
    expect(getProductArtwork(product)).toEqual({
      src: "/product.webp", fit: "cover", logoTone: null,
      fallbackSrc: "/logo.svg", fallbackFit: "contain", fallbackLogoTone: "light",
    });
  });

  it.each(["digital", "subscription", "service", "virtual_currency", "other"] as const)("preserves all of %s artwork", (kind) => {
    expect(getProductArtwork({ ...product, kind })).toMatchObject({ src: "/product.webp", fit: "contain", logoTone: null });
  });

  it("contains an explicit logo and retains its author-selected monochrome treatment", () => {
    expect(getProductArtwork({ ...product, imageUrl: null })).toEqual({
      src: "/logo.svg", fit: "contain", logoTone: "light",
      fallbackSrc: null, fallbackFit: "contain", fallbackLogoTone: null,
    });
  });

  it("does not try the same logo again as a fallback", () => {
    expect(getProductArtwork({ ...product, imageUrl: "/logo.svg" })).toMatchObject({ fit: "contain", fallbackSrc: null });
  });

  it.each(["gift_card", "redeem_code"] as const)("keeps %s denominations and branding inside the frame", (offerType) => {
    expect(getOfferArtwork({ imageUrl: "/voucher.webp", game: null, offerType })).toMatchObject({ src: "/voucher.webp", fit: "contain", logoTone: null });
  });

  it("uses a real parent logo when offer artwork is absent", () => {
    expect(getOfferArtwork({ imageUrl: null, offerType: "topup", game: { slug: "product", categorySlug: "games", name: "Product", imageUrl: "/scenery.jpg", logoUrl: "/logo.svg" } })).toMatchObject({ src: "/logo.svg", fit: "contain", fallbackSrc: "/scenery.jpg", fallbackFit: "cover" });
  });
});

describe("bounded image recovery", () => {
  const source = "https://store.supabase.co/storage/v1/object/public/catalog/product.png";

  it("tries a storage transform, then its unchanged original, then a distinct alternate", () => {
    const attempts = getImageAttempts({ src: source, fallbackSrc: "/logo.svg", width: 640, fallbackFit: "contain" });
    expect(attempts).toHaveLength(3);
    expect(attempts[0].srcSet).toContain("/storage/v1/render/image/public/catalog/product.png?width=320&quality=75 320w");
    expect(attempts[0].srcSet).not.toContain("format=webp");
    expect(attempts[1]).toEqual({ src: source, fit: "cover", logoTone: null });
    expect(attempts[2]).toEqual({ src: "/logo.svg", fit: "contain", logoTone: null });
  });

  it("bounds supplier image widths and keeps an original proxy attempt", () => {
    const attempts = getImageAttempts({ src: "https://supplier.example/item.jpg", width: 10_000 });
    expect(attempts).toHaveLength(2);
    expect(attempts[0].src).toContain("&width=1920");
    expect(attempts[1].src).not.toContain("width=");
  });

  it("does not transform vectors, local files, or repeatedly request identical alternates", () => {
    for (const src of ["/local.webp", "https://supplier.example/logo.svg", "https://supplier.example/animation.gif"]) {
      const attempts = getImageAttempts({ src, fallbackSrc: src });
      expect(attempts).toHaveLength(1);
      expect(attempts[0].srcSet).toBeUndefined();
    }
  });

  it("uses the alternate immediately when the primary is missing", () => {
    expect(getImageAttempts({ src: null, fallbackSrc: "/logo.svg", fallbackLogoTone: "dark" })).toEqual([{ src: "/logo.svg", srcSet: undefined, fit: "contain", logoTone: "dark" }]);
    expect(getImageAttempts({ src: null })).toEqual([]);
  });

  it("derives fallback identities from real Arabic or Latin product names", () => {
    expect(artworkMonogram("  Steam Card ")).toBe("SC");
    expect(artworkMonogram("بطاقة ستيم")).toBe("بس");
    expect(artworkMonogram("🛍️ Steam Card")).toBe("SC");
    expect(artworkMonogram(" ")).toBe("");
  });
});
