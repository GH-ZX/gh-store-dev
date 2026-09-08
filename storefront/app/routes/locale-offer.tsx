import { CatalogPage } from "@/components/store/catalog-page";
import { withAdminOfferCosts } from "@server/lib/services/catalog-admin-costs.service";
import { buildStorePageMeta } from "@/lib/store-seo";
export { CatalogErrorBoundary as ErrorBoundary } from "@/components/store/catalog-error-boundary";
import type { InputField } from "@/lib/catalog-queries";
import { OfferGrid } from "@/components/store/collections";
import { getOfferCardLabels } from "@/lib/catalog/labels";
import { Link, redirect, useLoaderData } from "react-router";
import { getCloudflareContext } from "@/lib/cloudflare-context";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { createPublicClient, getOfferDetail } from "@/lib/catalog-queries";
import { offerPath, productPath } from "@/lib/catalog/paths";
import { getRelatedProducts } from "@/lib/catalog/related-products";
import { DetailPurchaseSummary, ProductDetailHeader, ProductInformation, RelatedProductDiscovery } from "@/components/store/product-detail";
import type { StoreProduct } from "@/lib/catalog/product-mapper";
import type { StoreOffer } from "@/lib/catalog/offer-mapper";
import { buildBreadcrumbJsonLd, buildCatalogDescription, buildOfferJsonLd, getSiteUrl } from "@/lib/seo";
import type { Route } from "./+types/locale-offer";

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const locale = params.locale ?? "";
  const category = params.category ?? "";
  const productSlug = params.slug ?? "";
  const offerSlug = params.offerSlug ?? "";
  if (!isLocale(locale)) {
    throw new Response("Not Found", { status: 404 });
  }
  const { env } = getCloudflareContext(context);
  const client = createPublicClient(env);
  const detail = await getOfferDetail(
    client,
    locale,
    null,
    productSlug,
    offerSlug,
  );
  if (!detail) {
    throw new Response("Not Found", { status: 404 });
  }
  if (category !== detail.product.categorySlug) {
    throw redirect(`${offerPath(locale, detail.product, detail.offer)}${new URL(request.url).search}`, 301);
  }
  const [[offer, ...relatedOffers], relatedProducts] = await Promise.all([
    withAdminOfferCosts([detail.offer, ...detail.relatedOffers.slice(0, 6)]),
    getRelatedProducts(client, locale, detail.product),
  ]);
  return {
    locale,
    category,
    siteUrl: getSiteUrl(env),
    ...detail,
    offer,
    relatedOffers,
    relatedProducts,
  };
}

export function meta({ params, matches }: Route.MetaArgs) {
  const locale =
    params.locale && isLocale(params.locale) ? params.locale : DEFAULT_LOCALE;
  const match = matches.find((m) => m?.id === "routes/locale-offer") as
    | {
        loaderData?: {
          offer?: StoreOffer;
          product?: StoreProduct;
          category?: string;
          siteUrl?: string;
        };
      }
    | undefined;
  const offer = match?.loaderData?.offer;
  const product = match?.loaderData?.product;
  const productName = product?.name ?? "";
  const category = match?.loaderData?.category ?? params.category ?? "";
  const productRoutePath = `/${encodeURIComponent(category)}/${encodeURIComponent(product?.slug ?? params.slug ?? "")}`;
  const path = `${productRoutePath}/${encodeURIComponent(offer?.slug ?? params.offerSlug ?? "")}`;
  const siteUrl = match?.loaderData?.siteUrl ?? getSiteUrl();
  const common = getMessages(locale, "common");
  const title = offer?.name
    ? offer.name.trim() === productName.trim() ? offer.name : `${offer.name} — ${productName}`
    : "GH Store";
  return [
    ...buildStorePageMeta(
      {
        locale,
        path,
        type: "product",
        title,
        description: product && offer ? buildCatalogDescription({
          locale, productName, description: product.description, offerName: offer.name, offerDescription: offer.description,
        }) : "",
        imageUrl: offer?.imageUrl ?? product?.imageUrl ?? product?.logoUrl ?? null,
        siteUrl,
      },
      matches,
    ),
    ...(product && offer ? [
      { "script:ld+json": buildBreadcrumbJsonLd({ locale, siteUrl, items: [
        { name: common.navigation.home, path: "" },
        { name: product.categoryName ?? common.navigation.allProducts, path: `/${encodeURIComponent(product.categorySlug)}` },
        { name: product.name, path: productRoutePath },
        { name: offer.name, path },
      ] }) },
      { "script:ld+json": buildOfferJsonLd({ locale, siteUrl, product, offer }) },
    ] : []),
  ];
}

function FieldPreview({ field, labels }: { field: InputField; labels: { required: string; optional: string; allOptions: string } }) {
  return <li className="sf-offer-field">
    <div><strong><bdi>{field.label}</bdi></strong><span>{field.isRequired ? labels.required : labels.optional}</span></div>
    {field.placeholder ? <p><bdi>{field.placeholder}</bdi></p> : null}
    {field.options.length ? <ul>{field.options.slice(0, 6).map((option) => <li key={option.value}><bdi>{option.label}</bdi></li>)}</ul> : null}
    {field.options.length > 6 ? <details className="sf-detail-field-options"><summary>{labels.allOptions}</summary><ul>{field.options.slice(6).map((option) => <li key={option.value}><bdi>{option.label}</bdi></li>)}</ul></details> : null}
  </li>;
}

export default function LocaleOffer() {
  const { locale, product, offer, inputFields, deliveryKind, relatedOffers, relatedProducts } = useLoaderData<typeof loader>();
  const common = getMessages(locale, "common");
  const catalog = getMessages(locale, "catalog");
  const copy = catalog.productDetail;
  return <CatalogPage><div className="sf-detail-page">
    <nav className="sf-catalog-breadcrumb" aria-label={copy.breadcrumbLabel}>
      <Link to={`/${locale}`}>{common.navigation.home}</Link><span aria-hidden="true">/</span>
      <Link to={`/${locale}/${encodeURIComponent(product.categorySlug)}`}>{product.categoryName ?? common.navigation.allProducts}</Link><span aria-hidden="true">/</span>
      <Link to={productPath(locale, product)}><bdi>{product.name}</bdi></Link><span aria-hidden="true">/</span><span aria-current="page"><bdi>{offer.name}</bdi></span>
    </nav>
    <ProductDetailHeader locale={locale} product={product} offers={[offer]} offer={offer} />
    <div className="sf-product-layout sf-detail-layout">
      <section className="sf-offers-panel sf-detail-selection sf-detail-requirements" aria-labelledby="offer-requirements-heading">
        <h2 id="offer-requirements-heading">{copy.beforeCheckout}</h2>
        <p>{inputFields.length ? catalog.offerDetail.fieldsDescription : copy.noExtraDetails}</p>
        {inputFields.length ? <ul className="sf-offer-field-list">{inputFields.map((field) => <FieldPreview key={field.id} field={field} labels={{ required: catalog.offerDetail.requiredField, optional: catalog.offerDetail.optionalField, allOptions: copy.allOptions }} />)}</ul> : null}
        <div className="sf-detail-delivery"><h3>{copy.deliveryLabel}: {copy.deliveryKinds[deliveryKind]}</h3><p>{copy.deliveryNote}</p></div>
      </section>
      <DetailPurchaseSummary locale={locale} product={product} offer={offer} />
    </div>
    <ProductInformation locale={locale} product={product} offer={offer} />
    {relatedOffers.length ? <section className="sf-detail-related" aria-labelledby="related-offers-heading">
      <div className="sf-detail-section-heading"><div><h2 id="related-offers-heading">{catalog.offerDetail.relatedHeading}</h2><p>{copy.otherOffersDescription}</p></div><Link to={productPath(locale, product)}>{copy.allProductOffers}</Link></div>
      <OfferGrid className="sf-detail-related-offers" offers={relatedOffers} locale={locale} labels={getOfferCardLabels(common, catalog)} gameSlug={product.slug} showGameName={false} compact />
    </section> : null}
    <RelatedProductDiscovery locale={locale} product={product} related={relatedProducts} />
  </div></CatalogPage>;
}
