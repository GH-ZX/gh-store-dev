import { useDeferredValue, useState } from "react";
import { Link } from "react-router";
import type { Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { CheckIcon } from "@/components/ui/icons";
import { DetailPurchaseSummary, NoProductOffers } from "@/components/store/product-detail";
import { offerPath } from "@/lib/catalog/paths";
import type { StoreProduct } from "@/lib/catalog/product-mapper";
import type { StoreOffer } from "@/lib/catalog/offer-mapper";
import { formatNumber, formatPrice } from "@/lib/format/money";

export function ProductOfferSelection({ locale, product, offers }: {
  locale: Locale; product: StoreProduct; offers: StoreOffer[];
}) {
  const [selectedId, setSelectedId] = useState(offers[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("");
  const filterQuery = useDeferredValue(query).trim().toLocaleLowerCase(locale);
  const regions = [...new Set(offers.flatMap((offer) => offer.regionCode ? [offer.regionCode] : []))];
  const visibleOffers = offers.filter((offer) => (!region || offer.regionCode === region) && (!filterQuery || `${offer.name} ${offer.regionCode ?? ""}`.toLocaleLowerCase(locale).includes(filterQuery)));
  // The checkout selection must always be one of the offers the shopper can see.
  const selected = visibleOffers.find((offer) => offer.id === selectedId) ?? visibleOffers[0];
  const common = getMessages(locale, "common");
  const catalog = getMessages(locale, "catalog");
  const copy = catalog.productDetail;
  const hasFilters = Boolean(query || region);
  function clearFilters() { setQuery(""); setRegion(""); }
  if (offers.length === 0) return <NoProductOffers locale={locale} />;

  return <div className="sf-product-layout sf-detail-layout">
    <section className="sf-offers-panel sf-detail-selection" aria-labelledby="choose-offer-heading">
      <div className="sf-detail-section-heading"><div><h2 id="choose-offer-heading">{copy.chooseHeading}</h2><p>{offers.length === 1 ? copy.singleOfferDescription : copy.chooseDescription}</p></div></div>
      {offers.length > 1 ? <>
        <div className="sf-offer-filters">
          <label className="sf-offer-filter"><span>{copy.findOffer}</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy.searchPlaceholder} /></label>
          {regions.length > 1 ? <label className="sf-offer-filter sf-offer-filter--region"><span>{catalog.offerDetail.regionLabel}</span><select value={region} onChange={(event) => setRegion(event.target.value)}><option value="">{copy.allRegions}</option>{regions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label> : null}
        </div>
        <div className="sf-detail-filter-status"><p role="status"><bdi dir="ltr">{formatNumber(visibleOffers.length, locale)}</bdi> {copy.resultsLabel}</p>{hasFilters && visibleOffers.length > 0 ? <button type="button" onClick={clearFilters}>{copy.clearFilters}</button> : null}</div>
      </> : null}
      {selected && offers.length > 3 ? <div className="sf-detail-mobile-selection">
        <div><span>{copy.selectedLabel}</span><strong><bdi>{selected.name}</bdi></strong><bdi dir="ltr">{formatPrice(selected.price, selected.currency, locale)}</bdi></div>
        <Link className="sf-catalog-primary" to={`/${locale}/checkout/${encodeURIComponent(product.slug)}/${encodeURIComponent(selected.slug)}`}>{copy.checkout}</Link>
      </div> : null}
      <fieldset className="sf-offer-choices sf-detail-choices"><legend className="sr-only">{copy.chooseHeading}</legend>
        {visibleOffers.map((offer) => <div className="sf-offer-choice" key={offer.id} data-selected={offer.id === selected?.id}>
          <label className="sf-offer-choice-main">
            <input type="radio" name="selected-offer" value={offer.id} checked={offer.id === selected?.id} onChange={() => setSelectedId(offer.id)} />
            <span className="sf-offer-choice-copy"><strong><bdi>{offer.name}</bdi></strong>
              {offer.regionCode ? <small><bdi>{offer.regionCode}</bdi></small> : null}
              <span className="sf-offer-choice-price"><bdi dir="ltr">{formatPrice(offer.price, offer.currency, locale)}</bdi></span>
              {typeof offer.supplierCostUsd === "number" ? <small>{common.price.capital}: <bdi dir="ltr">{formatPrice(offer.supplierCostUsd, "USD", locale)}</bdi></small> : null}
              {offer.id === selected?.id ? <span className="sf-detail-selected-label"><CheckIcon />{copy.selectedLabel}</span> : null}
            </span>
          </label>
          <Link className="sf-offer-choice-detail" to={offerPath(locale, product, offer)}>{copy.detailsLink}</Link>
        </div>)}
      </fieldset>
      {visibleOffers.length === 0 ? <div className="sf-detail-no-matches"><p>{copy.noMatches}</p><button type="button" className="sf-detail-secondary" onClick={clearFilters}>{copy.clearFilters}</button></div> : null}
    </section>
    <DetailPurchaseSummary locale={locale} product={product} offer={selected} />
  </div>;
}
