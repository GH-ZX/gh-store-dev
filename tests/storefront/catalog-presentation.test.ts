import { describe, expect, it } from "vitest";
import { artworkMonogram, getImageAttempts, getOfferArtwork, getProductArtwork, toHexColor } from "@/lib/catalog/presentation";

describe("catalog artwork choices", () => {
  const product = { imageUrl: "/product.webp", logoUrl: "/logo.svg", kind: "game" as const, carouselLogoTone: "light" as const, carouselColor: null };

  it("fills game scenery without applying the logo's monochrome setting to it", () => {
    expect(getProductArtwork(product)).toEqual({
      src: "/product.webp", fit: "cover", logoTone: null,
      fallbackSrc: "/logo.svg", fallbackFit: "contain", fallbackLogoTone: "light",
      logoInk: null, fallbackLogoInk: null,
    });
  });

  it.each(["digital", "subscription", "service", "virtual_currency", "other"] as const)("preserves all of %s artwork", (kind) => {
    expect(getProductArtwork({ ...product, kind })).toMatchObject({ src: "/product.webp", fit: "contain", logoTone: null });
  });

  it("contains an explicit logo and retains its author-selected monochrome treatment", () => {
    expect(getProductArtwork({ ...product, imageUrl: null })).toEqual({
      src: "/logo.svg", fit: "contain", logoTone: "light",
      fallbackSrc: null, fallbackFit: "contain", fallbackLogoTone: null,
      logoInk: null, fallbackLogoInk: null,
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

describe("logo ink is independent of the tile surface", () => {
  const product = { imageUrl: "/product.webp", logoUrl: "/logo.svg", kind: "service" as const, carouselLogoTone: "light" as const, carouselColor: null };

  it("reads a plain hex ink colour and rejects anything else", () => {
    expect(toHexColor("#1F6FEB")).toBe("#1f6feb");
    expect(toHexColor("fff")).toBe("#ffffff");
    expect(toHexColor(" #1f6feb ")).toBe("#1f6feb");
    for (const invalid of ["", "   ", null, undefined, "red", "#12345", "rgb(0,0,0)", "#1f6feb; background:url(x)"]) {
      expect(toHexColor(invalid)).toBeNull();
    }
  });

  it("colours the logo mark itself and never the surrounding artwork", () => {
    expect(getProductArtwork({ ...product, carouselColor: "#1F6FEB" })).toEqual({
      src: "/product.webp", fit: "contain", fallbackSrc: "/logo.svg", fallbackFit: "contain",
      logoTone: null, fallbackLogoTone: null, logoInk: null, fallbackLogoInk: "#1f6feb",
    });
    expect(getProductArtwork({ ...product, imageUrl: null, carouselColor: "#1F6FEB" })).toMatchObject({
      src: "/logo.svg", fit: "contain", logoInk: "#1f6feb", logoTone: null,
    });
  });

  it("keeps the tone as the only ink control when no colour is chosen", () => {
    expect(getProductArtwork({ ...product, imageUrl: null })).toMatchObject({ logoInk: null, logoTone: "light" });
    expect(getProductArtwork({ ...product, imageUrl: null, carouselColor: "not-a-colour" })).toMatchObject({ logoInk: null, logoTone: "light" });
  });

  it("validates a tile colour the same way, so a bad value never reaches a style", () => {
    const base = { imageUrl: "/product.webp", logoUrl: "/logo.svg", kind: "service" as const, carouselLogoTone: null, carouselColor: null };
    for (const value of ["#0b1220", "#FFF", "0b1220", " #0b1220 "]) {
      expect(toHexColor(value)).toMatch(/^#[0-9a-f]{6}$/);
    }
    // A five-digit hex and an injected declaration are both refused.
    for (const value of ["", "  ", null, undefined, "black", "rgb(0,0,0)", "#0b122", "#0b1220;z", "url(x)"]) {
      expect(toHexColor(value)).toBeNull();
    }
    // A tile colour never changes the mark's own ink.
    expect(getProductArtwork({ ...base, carouselColor: "#1f6feb" })).toMatchObject({ logoInk: null, fallbackLogoInk: "#1f6feb" });
  });

  it("never offers artwork an ink colour", () => {
    expect(getOfferArtwork({ imageUrl: "/voucher.webp", game: { logoUrl: "/logo.svg" }, offerType: "topup" })).toMatchObject({ logoInk: null, fallbackLogoInk: null });
  });
});

describe("bounded image recovery", () => {
  const source = "https://store.supabase.co/storage/v1/object/public/catalog/product.png";

  it("tries a storage transform, then its unchanged original, then a distinct alternate", () => {
    const attempts = getImageAttempts({ src: source, fallbackSrc: "/logo.svg", width: 640, fallbackFit: "contain" });
    expect(attempts).toHaveLength(3);
    expect(attempts[0].srcSet).toContain("/storage/v1/render/image/public/catalog/product.png?width=320&quality=75 320w");
    expect(attempts[0].srcSet).not.toContain("format=webp");
    expect(attempts[1]).toEqual({ src: source, fit: "cover", logoTone: null, logoInk: null });
    expect(attempts[2]).toEqual({ src: "/logo.svg", fit: "contain", logoTone: null, logoInk: null });
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
    expect(getImageAttempts({ src: null, fallbackSrc: "/logo.svg", fallbackLogoTone: "dark" })).toEqual([{ src: "/logo.svg", srcSet: undefined, fit: "contain", logoTone: "dark", logoInk: null }]);
    expect(getImageAttempts({ src: null })).toEqual([]);
  });

  it("derives fallback identities from real Arabic or Latin product names", () => {
    expect(artworkMonogram("  Steam Card ")).toBe("SC");
    expect(artworkMonogram("بطاقة ستيم")).toBe("بس");
    expect(artworkMonogram("🛍️ Steam Card")).toBe("SC");
    expect(artworkMonogram(" ")).toBe("");
  });
});
