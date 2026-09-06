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
import { getSiteUrl } from "@/lib/seo";
import type { Route } from "./+types/locale-offer";

export async function loader({ params, context }: Route.LoaderArgs) {
  const locale = params.locale ?? "";
  const category = params.category ?? "";
  const gameSlug = params.slug ?? "";
  const offerSlug = params.offerSlug ?? "";
  if (!isLocale(locale)) {
    throw new Response("Not Found", { status: 404 });
  }
  const { env } = getCloudflareContext(context);
  const detail = await getOfferDetail(
    createPublicClient(env),
    locale,
    category,
    gameSlug,
    offerSlug,
  );
  if (!detail && category === "games") {
    const legacy = await getOfferDetail(
      createPublicClient(env),
      locale,
      null,
      gameSlug,
      offerSlug,
    );
    if (legacy)
      throw redirect(
        `/${locale}/${legacy.product.categorySlug}/${legacy.product.slug}/${legacy.offer.slug}`,
        301,
      );
  }
  if (!detail) {
    throw new Response("Not Found", { status: 404 });
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
          offer?: {
            name?: string;
            description?: string | null;
            imageUrl?: string | null;
          };
          product?: { name?: string };
          category?: string;
          siteUrl?: string;
        };
      }
    | undefined;
  const offer = match?.loaderData?.offer;
  const productName = match?.loaderData?.product?.name ?? "";
  const category = match?.loaderData?.category ?? params.category ?? "";
  return buildStorePageMeta(
    {
      locale,
      path: `/${category}/${params.slug ?? ""}/${params.offerSlug ?? ""}`,
      title: offer?.name ? `${offer.name} — ${productName}` : "GH Store",
      description: offer?.description ?? "",
      imageUrl: offer?.imageUrl ?? null,
      siteUrl: match?.loaderData?.siteUrl ?? getSiteUrl(),
    },
    matches,
  );
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
        <section><h2>{catalog.gameDetail.howItWorksHeading}</h2><ol className="sf-product-steps">{catalog.gameDetail.howItWorksSteps.map((step) => <li key={step}>{step}</li>)}</ol></section>
      </div>
    </div>
    {relatedOffers.length ? <section className="sf-catalog-result-section">
      <div className="sf-related-heading"><h2>{catalog.offerDetail.relatedHeading}</h2><Link to={`/${locale}/${product.categorySlug}/${product.slug}`}>{common.actions.viewAll}</Link></div>
      <OfferGrid className="storefront-offer-grid" offers={relatedOffers} locale={locale} labels={getOfferCardLabels(common, catalog)} gameSlug={product.slug} showGameName={false} compact />
    </section> : null}
  </CatalogPage>;
}
