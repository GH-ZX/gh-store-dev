import { describe, expect, it } from "vitest";
import { catalogDescriptionText } from "@/lib/catalog/description";
import { toStoreProduct, type ProductRow } from "@/lib/catalog/product-mapper";
import { toStoreOffer, type OfferRow } from "@/lib/catalog/offer-mapper";

const descriptions = {
  ar: '<tg-emoji emoji-id="5310176773114197087">🤖</tg-emoji> اشتراك Gemini\nالتفاصيل: https://example.test/help?a=1&b=2',
  en: '<tg-emoji emoji-id="5310176773114197087">🤖</tg-emoji> GEMINI AI PRO\nDetails: https://example.test/help?a=1&b=2',
};
const expectedDescriptions = {
  ar: "🤖 اشتراك Gemini\nالتفاصيل: https://example.test/help?a=1&b=2",
  en: "🤖 GEMINI AI PRO\nDetails: https://example.test/help?a=1&b=2",
};
const productRow: ProductRow = Object.freeze({
  id: "product", slug: "assistant", name_ar: "مساعد", name_en: "Assistant",
  description_ar: descriptions.ar, description_en: descriptions.en,
  points_name_ar: null, points_name_en: null, image_url: null, logo_url: null,
  is_featured: true, product_kind: "subscription",
});
const offerRow: OfferRow = Object.freeze({
  id: "offer", slug: "monthly", offer_type: "redeem_code", name_ar: "شهري", name_en: "Monthly",
  description_ar: descriptions.ar, description_en: descriptions.en,
  price: 10, original_price: null, currency: "USD", is_sale: false,
});

describe("public catalog description text", () => {
  it("removes the observed Telegram wrapper while preserving its emoji and title", () => {
    expect(catalogDescriptionText(descriptions.en)).toBe(expectedDescriptions.en);
  });

  it("preserves Unicode emoji sequences, links and exact multiline spacing", () => {
    const input = '  <TG-EMOJI emoji-id=\'1\'>👩🏽‍💻</TG-EMOJI> Build\r\n\r\n<tg-emoji\n emoji-id="2">❤️</tg-emoji> https://example.test/a?x=1&y=2  ';
    expect(catalogDescriptionText(input)).toBe("  👩🏽‍💻 Build\r\n\r\n❤️ https://example.test/a?x=1&y=2  ");
  });

  it.each([
    "Plain product description",
    "x < y and y > z; Array<T>; 2 < 3 > 1",
    '<a href="https://example.test/help">Help</a> <tg-emoji-custom>literal</tg-emoji-custom>',
    "  First line\nSecond line  ",
    "",
  ])("leaves ordinary text unchanged: %s", (description) => {
    expect(catalogDescriptionText(description)).toBe(description);
  });

  it.each([null, undefined])("returns null for absent descriptions: %s", (description) => {
    expect(catalogDescriptionText(description)).toBeNull();
  });

  it.each(["ar", "en"] as const)("normalizes %s product and offer display values without modifying stored copy", (locale) => {
    expect(toStoreProduct(productRow, locale).description).toBe(expectedDescriptions[locale]);
    expect(toStoreOffer(offerRow, locale).description).toBe(expectedDescriptions[locale]);
    expect(productRow.description_ar).toBe(descriptions.ar);
    expect(productRow.description_en).toBe(descriptions.en);
    expect(offerRow.description_ar).toBe(descriptions.ar);
    expect(offerRow.description_en).toBe(descriptions.en);
  });

  it.each(["ar", "en"] as const)("retains null descriptions in %s public mappers", (locale) => {
    expect(toStoreProduct({ ...productRow, description_ar: null, description_en: null }, locale).description).toBeNull();
    expect(toStoreOffer({ ...offerRow, description_ar: null, description_en: null }, locale).description).toBeNull();
  });
});
