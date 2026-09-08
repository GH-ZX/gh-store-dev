/** A successful save acknowledges the submitted value, which may already have a newer draft. */
export type SavedOfferPrice = { price: number; previousServerPrice: number };

export type OfferPriceDraft = {
  offerId: string;
  serverPrice: number;
  baselinePrice: number;
  value: string;
  dirty: boolean;
  appliedSave: SavedOfferPrice | undefined;
};

type PriceSnapshot = {
  offerId: string;
  price: number;
  saved?: SavedOfferPrice;
  pending?: boolean;
};

function samePrice(value: string, price: number): boolean {
  return value.trim() !== "" && Number(value) === price;
}

export function createOfferPriceDraft({ offerId, price, saved }: PriceSnapshot): OfferPriceDraft {
  return { offerId, serverPrice: price, baselinePrice: price, value: String(price), dirty: false, appliedSave: saved };
}

/** Revalidation updates clean fields; it never replaces an unsaved edit. */
export function reconcileOfferPriceDraft(current: OfferPriceDraft, snapshot: PriceSnapshot): OfferPriceDraft {
  if (current.offerId !== snapshot.offerId) return createOfferPriceDraft(snapshot);
  let next = current;
  const saved = snapshot.saved;
  if (saved && saved !== current.appliedSave) {
    // Loader data may arrive before the action response. Otherwise the saved
    // submission is the baseline until the corresponding revalidation arrives.
    const baselinePrice = snapshot.price !== saved.previousServerPrice ? snapshot.price : saved.price;
    const submittedDraft = samePrice(next.value, saved.price);
    next = {
      ...next,
      appliedSave: saved,
      baselinePrice,
      value: submittedDraft ? String(baselinePrice) : next.value,
      dirty: !submittedDraft && !samePrice(next.value, baselinePrice),
    };
  }
  if (next.serverPrice !== snapshot.price) {
    next = {
      ...next,
      serverPrice: snapshot.price,
      baselinePrice: snapshot.price,
      value: next.dirty ? next.value : String(snapshot.price),
      dirty: next.dirty && (Boolean(snapshot.pending) || !samePrice(next.value, snapshot.price)),
    };
  }
  if (!snapshot.pending && next.dirty && samePrice(next.value, next.baselinePrice)) next = { ...next, dirty: false };
  return next;
}

export function editOfferPriceDraft(current: OfferPriceDraft, value: string, pending: boolean): OfferPriceDraft {
  // Reverting to the old server value during a save is still a new edit: the
  // in-flight request may be saving a different price.
  return { ...current, value, dirty: pending || !samePrice(value, current.baselinePrice) };
}
