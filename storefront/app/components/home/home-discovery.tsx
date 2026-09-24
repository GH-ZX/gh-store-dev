import { measureStoreEvent } from "@/lib/analytics/events";
import { useId, useState } from "react";
import { Link } from "react-router";
import type { Locale } from "@/i18n/config";
import type { HomeDiscovery } from "@server/lib/services/home-discovery.service";
import { getProductCardLabels, getOfferCardLabels } from "@/lib/catalog/labels";
import { getMessages } from "@/i18n/messages";
import { Section, SectionHeader } from "@/components/ui/section";
import { ProductGrid, OfferGrid } from "@/components/store/collections";
import { OfferTerms } from "@/components/store/offer-terms";
import { StoreImage } from "@/components/store/store-image";
import { getProductArtwork } from "@/lib/catalog/presentation";
import { productPath } from "@/lib/catalog/paths";
import { formatPrice } from "@/lib/format/money";

function QuickBuy({ item, locale }: { item: HomeDiscovery["suggestions"][number]; locale: Locale }) {
  const id = useId();
  const [offerId, setOfferId] = useState(item.offers[0]?.id);
  const offer = item.offers.find(choice => choice.id === offerId) ?? item.offers[0];
  if (!offer) return null;
  const ar = locale === "ar";
  return <article className="sf-quick-buy" aria-labelledby={`${id}-title`}>
    <Link className="sf-quick-product" to={productPath(locale, item.product)}>
      <div className="sf-quick-thumb"><StoreImage {...getProductArtwork(item.product, "thumbnail")} alt="" width={128} sizes="64px" fallbackLabel={item.product.name} /></div>
      <div><span>{item.product.categoryName}</span><h3 id={`${id}-title`} dir="auto">{item.product.name}</h3></div>
    </Link>
    <label htmlFor={`${id}-offer`}>{ar ? "اختر العرض" : "Choose an offer"}</label>
    <select id={`${id}-offer`} value={offer.id} onChange={event => setOfferId(event.target.value)}>
      {item.offers.map(choice => <option key={choice.id} value={choice.id}>{choice.name}{choice.regionCode ? ` · ${choice.regionCode}` : ""} — {formatPrice(choice.price, choice.currency, locale)}</option>)}
    </select>
    <div className="sf-quick-facts" aria-live="polite"><OfferTerms terms={offer.terms} locale={locale} />
      {offer.regionCode ? <p>{ar ? "المنطقة" : "Region"}: <bdi>{offer.regionCode}</bdi></p> : null}
    </div>
    <div className="sf-quick-actions"><strong><bdi>{formatPrice(offer.price, offer.currency, locale)}</bdi></strong>
      <Link onClick={() => measureStoreEvent("quick_buy")} className="sf-catalog-primary" to={`/${locale}/checkout/${encodeURIComponent(item.product.slug)}/${encodeURIComponent(offer.slug)}`} aria-label={`${ar ? "شراء" : "Buy"} ${item.product.name}: ${offer.name}`}>{ar ? "شراء سريع" : "Quick buy"}</Link>
    </div>
    <Link className="sf-quick-details" to={productPath(locale, item.product)}>{ar ? "التفاصيل وجميع العروض" : "Details & all offers"}</Link>
  </article>;
}
export function HomeQuickBuy({ discovery, locale }: { discovery: HomeDiscovery; locale: Locale }) {
  if (!discovery.suggestions.length) return null;
  const ar = locale === "ar";
  return <Section spacing="tight" className="sf-discovery-section" aria-labelledby="quick-buy-heading">
    <div className="sf-discovery-heading"><div><p>{ar ? "اختيارات من المتجر" : "Discover GH Store"}</p><h2 id="quick-buy-heading">{ar ? "اختر عرضك وتابع الشراء" : "Find your offer. Get straight to checkout."}</h2></div>
      <Link to={`/${locale}/products`}>{ar ? "جميع المنتجات" : "All products"} →</Link></div>
    <p className="sf-discovery-note">{ar ? "راجع المدة والضمان والمنطقة قبل المتابعة. تأكيد الطلب والدفع في الخطوة التالية." : "Check the duration, warranty and region. Review and confirm your order at checkout."}</p>
    <div className="sf-quick-grid">{discovery.suggestions.map(item => <QuickBuy key={item.product.id} item={item} locale={locale} />)}</div>
  </Section>;
}
export function HomeCategoryShowcases({ discovery, locale, exclude }: { discovery: HomeDiscovery; locale: Locale; exclude: string[] }) {
  const common = getMessages(locale, "common");
  const catalog = getMessages(locale, "catalog");
  return discovery.groups.filter(group => !exclude.includes(group.slug)).map(group => <Section spacing="tight" className="sf-discovery-section" key={group.slug}>
    <SectionHeader title={group.name} viewAllHref={`/${locale}/${encodeURIComponent(group.slug)}`} viewAllLabel={locale === "ar" ? "عرض الكل" : "View all"} />
    <div className="mt-5">{group.products.length === 1 && group.offers.length > 1 ? <OfferGrid offers={group.offers} locale={locale} layout="rail" railLabel={group.name} labels={getOfferCardLabels(common, catalog)} /> : <ProductGrid games={group.products} locale={locale} layout="rail" railLabel={group.name} labels={getProductCardLabels(common, catalog)} />}</div>
  </Section>);
}
