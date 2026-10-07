import { ProductArtwork } from "@/components/store/product-artwork";
import { OfferTerms } from "@/components/store/offer-terms";
import { Link } from "react-router";
import type { Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { PackageIcon } from "@/components/ui/icons";
import { TelegramIcon, WhatsAppIcon } from "@/components/ui/brand-icons";
import { ProductGrid } from "@/components/store/collections";
import { PurchaseSummary } from "@/components/store/catalog-page";
import { DescriptionText } from "@/components/store/description-text";
import { getProductCardLabels } from "@/lib/catalog/labels";
import { productPath } from "@/lib/catalog/paths";
import type { StoreProduct } from "@/lib/catalog/product-mapper";
import type { StoreOffer } from "@/lib/catalog/offer-mapper";
import type { RelatedProducts } from "@/lib/catalog/related-products";
import { formatNumber, formatPrice, lowestPrice } from "@/lib/format/money";
import { AvailabilityNotice, summariseAvailability, type AvailabilityEntry } from "@/components/store/availability-notice";
import { RegionNotice, RegionSiblingLinks, regionQualifiedName, regionVariantOf } from "@/components/store/region-notice";
import { regionVariantLabel, siblingVariantSlugs } from "@/lib/catalog/region-variants";
import "@/styles/storefront-product.css";

/** Region facts and sibling links, rendered once for a product that has them. */
export function RegionSection({ locale, product, related }: {
  locale: Locale; product: StoreProduct; related?: StoreProduct[];
}) {
  const variant = regionVariantOf(product);
  if (!variant) return null;
  const locked = variant.family === "turkey-store-credit";
  return <>
    <RegionNotice product={product} locale={locale} locked={locked} />
    {related ? <RegionSiblingLinks product={product} siblings={related} locale={locale} /> : null}
  </>;
}

export function ProductDetailHeader({ locale, product, offers, offer, availability }: {
  locale: Locale; product: StoreProduct; offers: StoreOffer[]; offer?: StoreOffer;
  availability?: Record<string, AvailabilityEntry>;
}) {
  const common = getMessages(locale, "common");
  const catalog = getMessages(locale, "catalog");
  const copy = catalog.productDetail;
  const cheapest = lowestPrice(offers);
  const description = (offer?.description || product.description || "").trim().replace(/\s+/g, " ");
  const excerpt = description.length > 200 ? `${description.slice(0, 197).trimEnd()}…` : description;
  const variant = regionVariantOf(product);
  const regionName = regionVariantLabel(variant, locale);
  const summary = summariseAvailability(availability);
  return <header className="sf-detail-hero">
    <div className="sf-detail-artwork">
      <ProductArtwork product={{ ...product, imageUrl: offer?.imageUrl ?? product.imageUrl }} priority large />
    </div>
    <div className="sf-detail-hero-copy">
      <div className="sf-detail-eyebrow"><span>{offer ? copy.offerLabel : copy.productLabel}</span>{product.kind !== "other" ? <span>{catalog.productKinds[product.kind]}</span> : null}</div>
      <h1><bdi>{offer?.name ?? regionQualifiedName(product, locale)}</bdi></h1>
      {offer ? <Link className="sf-detail-parent-link" to={productPath(locale, product)}><bdi>{regionQualifiedName(product, locale)}</bdi></Link> : offers.length ? <p>{catalog.gameDetail.chooseOffer}</p> : null}
      {regionName ? <p className="sf-detail-region-line"><bdi>{regionName}</bdi></p> : null}
      {excerpt ? <p className="sf-detail-excerpt"><bdi>{excerpt}</bdi></p> : null}
      <dl className="sf-detail-facts">
        <div><dt>{copy.categoryLabel}</dt><dd><Link to={`/${locale}/${encodeURIComponent(product.categorySlug)}`}>{product.categoryName ?? common.navigation.allProducts}</Link></dd></div>
        {offer ? <div><dt>{catalog.offerDetail.priceLabel}</dt><dd className="sf-detail-price"><bdi dir="ltr">{formatPrice(offer.price, offer.currency, locale)}</bdi></dd></div> : <>
          <div><dt>{copy.offersFactLabel}</dt><dd><bdi dir="ltr">{formatNumber(offers.length, locale)}</bdi></dd></div>
          {cheapest ? <div><dt>{common.price.from}</dt><dd className="sf-detail-price"><bdi dir="ltr">{formatPrice(cheapest.price, cheapest.currency, locale)}</bdi></dd></div> : null}
        </>}
        {variant ? <div><dt>{copy.regionFactLabel}</dt><dd data-region-published={regionName ? "true" : "false"}><bdi>{regionName ?? copy.regionUnverified}</bdi></dd></div> : null}
        {offer?.regionCode ? <div><dt>{catalog.offerDetail.regionLabel}</dt><dd><bdi>{offer.regionCode}</bdi></dd></div> : null}
      </dl>
      {offer ? <OfferTerms terms={offer.terms} locale={locale} /> : null}
      <AvailabilityNotice availability={summary} locale={locale} />
    </div>
  </header>;
}

export function DetailPurchaseSummary({ locale, product, offer }: {
  locale: Locale; product: StoreProduct; offer: StoreOffer | undefined;
}) {
  return <div className="sf-detail-summary" id="product-order-summary">
    <PurchaseSummary locale={locale} product={product} offer={offer} />
  </div>;
}

export function ProductInformation({ locale, product, offer }: {
  locale: Locale; product: StoreProduct; offer?: StoreOffer;
}) {
  const catalog = getMessages(locale, "catalog");
  const description = offer?.description || product.description;
  return <div className="sf-detail-information" data-has-description={Boolean(description)}>
    {description ? <section><h2>{offer?.description ? catalog.productDetail.offerAboutHeading : catalog.productDetail.aboutHeading}</h2><DescriptionText text={description} /></section> : null}
    <section><h2>{catalog.gameDetail.howItWorksHeading}</h2><ol className="sf-product-steps">{catalog.gameDetail.howItWorksSteps.map((step, index) => <li key={step}><span className="sf-product-step-number" aria-hidden="true">{index + 1}</span>{step}</li>)}</ol></section>
  </div>;
}

export function NoProductOffers({ locale, product }: { locale: Locale; product?: StoreProduct }) {
  const copy = getMessages(locale, "catalog").productDetail;
  const isAr = locale === "ar";
  const productName = product?.name ?? "";
  const requestText = isAr
    ? `مرحباً، أود الاستفسار عن توفر منتج "${productName}"`
    : `Hello, I'd like to ask about availability for "${productName}"`;

  const telegramUrl = `https://t.me/ahmedghx?text=${encodeURIComponent(requestText)}`;
  const whatsappUrl = `https://wa.me/963968098330?text=${encodeURIComponent(requestText)}`;
  const ticketSubject = isAr ? `طلب توفير منتج: ${productName}` : `Product Request: ${productName}`;
  const supportTicketUrl = `/${locale}/support?subject=${encodeURIComponent(ticketSubject)}&body=${encodeURIComponent(requestText)}`;

  return <section className="sf-detail-unavailable" aria-labelledby="no-product-offers">
    <span className="sf-detail-empty-icon"><PackageIcon /></span>
    <div>
      <h2 id="no-product-offers">{copy.noOffersHeading}</h2>
      <p>{copy.noOffersDescription}</p>
      <div className="sf-detail-empty-actions">
        <a className="sf-catalog-primary inline-flex items-center gap-2" href={telegramUrl} target="_blank" rel="noopener noreferrer">
          <TelegramIcon className="size-4 shrink-0" />
          <span>{copy.requestViaTelegram}</span>
        </a>
        <a className="sf-detail-secondary inline-flex items-center gap-2" href={whatsappUrl} target="_blank" rel="noopener noreferrer">
          <WhatsAppIcon className="size-4 shrink-0" />
          <span>{copy.requestViaWhatsApp}</span>
        </a>
        <Link className="sf-detail-secondary" to={supportTicketUrl}>{copy.requestViaTicket}</Link>
        <Link className="sf-detail-secondary" to={`/${locale}/contact`}>{copy.contactSupport}</Link>
        <Link className="sf-detail-secondary" to={`/${locale}/products`}>{copy.browseProducts}</Link>
      </div>
    </div>
  </section>;
}

export function RelatedProductDiscovery({ locale, product, related }: {
  locale: Locale; product: StoreProduct; related: RelatedProducts;
}) {
  if (related.products.length === 0) return null;
  const common = getMessages(locale, "common");
  const catalog = getMessages(locale, "catalog");
  const copy = catalog.productDetail;
  const title = related.scope === "category" ? copy.relatedCategoryHeading
    : related.scope === "kind" ? copy.relatedKindHeading : copy.relatedCatalogHeading;
  return <section className="sf-detail-related" aria-labelledby="related-products-heading">
    <div className="sf-detail-section-heading"><div><h2 id="related-products-heading">{title}</h2><p>{copy.relatedDescription}</p></div><Link to={`/${locale}/${related.scope === "category" ? encodeURIComponent(product.categorySlug) : "products"}`}>{common.actions.viewAll}</Link></div>
    <ProductGrid games={related.products} locale={locale} labels={getProductCardLabels(common, catalog)} className="sf-detail-related-grid" />
  </section>;
}
