type OfferFilterInput = {
  offerType: "topup" | "gift_card" | "redeem_code";
  isSale: boolean;
};

export function isGiftCardOffer(offer: OfferFilterInput): boolean {
  return offer.offerType === "gift_card" || offer.offerType === "redeem_code";
}

export function isSaleOffer(offer: OfferFilterInput): boolean {
  return offer.isSale;
}
