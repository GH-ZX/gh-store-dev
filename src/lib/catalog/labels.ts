import type { OfferCardLabels } from "@/components/store/offer-card";
import type { CatalogMessages, CommonMessages } from "@/i18n/messages";

/**
 * Card label bundles.
 *
 * Cards take labels as data instead of reading messages themselves, so they stay
 * usable from any page. These builders keep every call site consistent and mean
 * a copy change lands in one place.
 */

export function getOfferCardLabels(common: CommonMessages, catalog: CatalogMessages): OfferCardLabels {
  return {
    sale: common.badges.sale,
    discount: common.price.discount,
    capital: common.price.capital,
    offerTypes: {
      topup: catalog.offerTypes.topup,
      gift_card: catalog.offerTypes.gift_card,
      redeem_code: catalog.offerTypes.redeem_code,
    },
  };
}

export function getProductCardLabels(common: CommonMessages): { featured: string; from: string } {
  return {
    featured: common.badges.featured,
    from: common.price.from,
  };
}
