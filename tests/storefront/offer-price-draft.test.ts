import { describe, expect, it } from "vitest";
import { createOfferPriceDraft, editOfferPriceDraft, reconcileOfferPriceDraft, type SavedOfferPrice } from "@/lib/catalog/offer-price-draft";

const initial = () => createOfferPriceDraft({ offerId: "offer-1", price: 12 });
const snapshot = (price: number, saved?: SavedOfferPrice, pending = false) => ({ offerId: "offer-1", price, saved, pending });

describe("admin offer price drafts", () => {
  it("adopts a supplier refresh when the price has not been edited", () => {
    expect(reconcileOfferPriceDraft(initial(), snapshot(15))).toMatchObject({ value: "15", dirty: false });
  });
  it("preserves a real draft through unrelated refreshes", () => {
    const edited = editOfferPriceDraft(initial(), "18", false);
    const refreshed = reconcileOfferPriceDraft(edited, snapshot(15));
    expect(refreshed).toMatchObject({ value: "18", baselinePrice: 15, dirty: true });
    expect(reconcileOfferPriceDraft(refreshed, snapshot(16))).toMatchObject({ value: "18", dirty: true });
  });
  it("treats returning to the saved price as clean outside a save", () => {
    const edited = editOfferPriceDraft(initial(), "18", false);
    const reverted = editOfferPriceDraft(edited, "12.00", false);
    expect(reconcileOfferPriceDraft(reverted, snapshot(15))).toMatchObject({ value: "15", dirty: false });
  });
  it.each(["response-first", "loader-first"])("adopts later server changes after a successful save: %s", (order) => {
    const saved = { price: 15, previousServerPrice: 12 };
    let draft = editOfferPriceDraft(initial(), "15.00", false);
    if (order === "response-first") {
      draft = reconcileOfferPriceDraft(draft, snapshot(12, saved));
      expect(draft).toMatchObject({ value: "15", dirty: false });
    } else {
      draft = reconcileOfferPriceDraft(draft, snapshot(15, undefined, true));
    }
    draft = reconcileOfferPriceDraft(draft, snapshot(15, saved));
    expect(draft).toMatchObject({ value: "15", dirty: false });
    expect(reconcileOfferPriceDraft(draft, snapshot(20, saved))).toMatchObject({ value: "20", dirty: false });
  });
  it.each(["response-first", "loader-first"])("keeps a newer edit typed during a save: %s", (order) => {
    const saved = { price: 15, previousServerPrice: 12 };
    let draft = editOfferPriceDraft(initial(), "15", false);
    draft = editOfferPriceDraft(draft, "18", true);
    if (order === "response-first") draft = reconcileOfferPriceDraft(draft, snapshot(12, saved));
    else draft = reconcileOfferPriceDraft(draft, snapshot(15, undefined, true));
    draft = reconcileOfferPriceDraft(draft, snapshot(15, saved));
    expect(draft).toMatchObject({ value: "18", baselinePrice: 15, dirty: true });
  });
  it.each(["response-first", "loader-first"])("keeps a pending edit back to the former price: %s", (order) => {
    const saved = { price: 15, previousServerPrice: 12 };
    let draft = editOfferPriceDraft(initial(), "15", false);
    draft = editOfferPriceDraft(draft, "12", true);
    if (order === "response-first") draft = reconcileOfferPriceDraft(draft, snapshot(12, saved));
    else draft = reconcileOfferPriceDraft(draft, snapshot(15, undefined, true));
    draft = reconcileOfferPriceDraft(draft, snapshot(15, saved));
    expect(draft).toMatchObject({ value: "12", baselinePrice: 15, dirty: true });
  });
  it("keeps an invalid blank draft through a refresh and failed save", () => {
    let draft = editOfferPriceDraft(initial(), "", true);
    draft = reconcileOfferPriceDraft(draft, snapshot(15, undefined, true));
    expect(reconcileOfferPriceDraft(draft, snapshot(15))).toMatchObject({ value: "", dirty: true });
  });
  it("adopts refreshed authoritative data when it precedes the save response", () => {
    const saved = { price: 15, previousServerPrice: 12 };
    let draft = editOfferPriceDraft(initial(), "15", false);
    draft = reconcileOfferPriceDraft(draft, snapshot(16, undefined, true));
    expect(reconcileOfferPriceDraft(draft, snapshot(16, saved))).toMatchObject({ value: "16", dirty: false });
  });
  it("clears only the submitted snapshot on a second successful save", () => {
    const saved = { price: 15, previousServerPrice: 12 };
    let draft = reconcileOfferPriceDraft(editOfferPriceDraft(initial(), "15", false), snapshot(15, saved));
    draft = editOfferPriceDraft(draft, "18", false);
    draft = reconcileOfferPriceDraft(draft, snapshot(15, { price: 18, previousServerPrice: 15 }));
    expect(draft).toMatchObject({ value: "18", dirty: false });
  });
  it("resets when a different offer occupies the field", () => {
    const edited = editOfferPriceDraft(initial(), "18", false);
    expect(reconcileOfferPriceDraft(edited, { offerId: "offer-2", price: 9 })).toMatchObject({ offerId: "offer-2", value: "9", dirty: false });
  });
});
