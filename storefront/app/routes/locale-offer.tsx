import { CatalogPage, PurchaseSummary } from "@/components/store/catalog-page";
import { withAdminOfferCosts } from "@server/lib/services/catalog-admin-costs.service";
import { buildStorePageMeta } from "@/lib/store-seo";
export { CatalogErrorBoundary as ErrorBoundary } from "@/components/store/catalog-error-boundary";
import type { InputField } from "@/lib/catalog-queries";
import { OfferGrid } from "@/components/store/collections";
import { DescriptionText } from "@/components/store/description-text";
import { StoreImage } from "@/components/store/store-image";
import { getOfferCardLabels } from "@/lib/catalog/labels";
import { Link, redirect, useLoaderData } from "react-router";
import { getCloudflareContext } from "@/lib/cloudflare-context";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { createPublicClient, getOfferDetail } from "@/lib/catalog-queries";
import { offerPath } from "@/lib/catalog/paths";
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
  const detail = await getOfferDetail(
    createPublicClient(env),
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
  const [offer, ...relatedOffers] = await withAdminOfferCosts([
    detail.offer,
    ...detail.relatedOffers,
  ]);
  return {
    locale,
    category,
    siteUrl: getSiteUrl(env),
    ...detail,
    offer,
    relatedOffers,
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
        { name: product.name, path: productRoutePath },
        { name: offer.name, path },
      ] }) },
      { "script:ld+json": buildOfferJsonLd({ locale, siteUrl, product, offer }) },
    ] : []),
  ];
}

function FieldPreview({ field, labels }: { field: InputField; labels: { required: string; optional: string } }) {
  return <li className="sf-offer-field">
    <div><strong>{field.label}</strong><span>{field.isRequired ? labels.required : labels.optional}</span></div>
    {field.placeholder ? <p>{field.placeholder}</p> : null}
    {field.options.length ? <ul>{field.options.slice(0, 6).map((option) => <li key={option.value}><bdi>{option.label}</bdi></li>)}</ul> : null}
  </li>;
}

export default function LocaleOffer() {
  const { locale, product, offer, inputFields, relatedOffers } = useLoaderData<typeof loader>();
  const common = getMessages(locale, "common");
  const catalog = getMessages(locale, "catalog");
  return <CatalogPage>
    <nav className="sf-catalog-breadcrumb" aria-label={locale === "ar" ? "مسار التنقل" : "Breadcrumb"}>
      <Link to={`/${locale}`}>{common.navigation.home}</Link><span aria-hidden="true">/</span>
      <Link to={`/${locale}/${product.categorySlug}/${product.slug}`}><bdi>{product.name}</bdi></Link><span aria-hidden="true">/</span><span aria-current="page"><bdi>{offer.name}</bdi></span>
    </nav>
    <header className="sf-product-intro">
      <div className="sf-product-art"><StoreImage src={offer.imageUrl ?? product.imageUrl} alt={offer.name} priority sizes="(max-width: 719px) 104px, 180px" /></div>
      <div className="sf-product-intro-copy"><h1><bdi>{offer.name}</bdi></h1><p><Link to={`/${locale}/${product.categorySlug}/${product.slug}`}><bdi>{product.name}</bdi></Link></p>
        <dl className="sf-product-facts">
          <div><dt>{catalog.offerDetail.typeLabel}</dt><dd>{catalog.offerTypes[offer.offerType]}</dd></div>
          {offer.regionCode ? <div><dt>{catalog.offerDetail.regionLabel}</dt><dd><bdi>{offer.regionCode}</bdi></dd></div> : null}
        </dl>
      </div>
    </header>
    <div className="sf-product-layout">
      <section className="sf-offers-panel">
        <h2>{inputFields.length ? catalog.offerDetail.fieldsHeading : catalog.offerDetail.noFieldsTitle}</h2>
        <p className="sf-catalog-muted mt-3">{inputFields.length ? catalog.offerDetail.fieldsDescription : catalog.offerDetail.noFieldsDescription}</p>
        {inputFields.length ? <ul className="sf-offer-field-list">{inputFields.map((field) => <FieldPreview key={field.id} field={field} labels={{ required: catalog.offerDetail.requiredField, optional: catalog.offerDetail.optionalField }} />)}</ul> : null}
      </section>
      <PurchaseSummary locale={locale} product={product} offer={offer} />
      <div className="sf-product-details">
        {offer.description || product.description ? <section><h2>{locale === "ar" ? "تفاصيل العرض" : "Offer details"}</h2><DescriptionText text={offer.description ?? product.description ?? ""} /></section> : null}
        <section><h2>{catalog.gameDetail.howItWorksHeading}</h2><ol className="sf-product-steps">{catalog.gameDetail.howItWorksSteps.map((step, index) => <li key={step}><span className="sf-product-step-number" aria-hidden="true">{index + 1}</span>{step}</li>)}</ol></section>
      </div>
    </div>
    {relatedOffers.length ? <section className="sf-catalog-result-section">
      <div className="sf-related-heading"><h2>{catalog.offerDetail.relatedHeading}</h2><Link to={`/${locale}/${product.categorySlug}/${product.slug}`}>{common.actions.viewAll}</Link></div>
      <OfferGrid className="storefront-offer-grid" offers={relatedOffers} locale={locale} labels={getOfferCardLabels(common, catalog)} gameSlug={product.slug} showGameName={false} compact />
    </section> : null}
  </CatalogPage>;
}
