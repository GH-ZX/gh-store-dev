import { useDeferredValue, useState } from "react";
import { CatalogPage, PurchaseSummary } from "@/components/store/catalog-page";
import type { StoreProduct } from "@/lib/catalog/product-mapper";
import type { StoreOffer } from "@/lib/catalog/offer-mapper";
import type { Locale } from "@/i18n/config";
import { withAdminOfferCosts } from "@server/lib/services/catalog-admin-costs.service";
import { buildStorePageMeta } from "@/lib/store-seo";
export { CatalogErrorBoundary as ErrorBoundary } from "@/components/store/catalog-error-boundary";
import { EmptyState } from "@/components/shared/states";
import { DescriptionText } from "@/components/store/description-text";
import { ProductBreadcrumb } from "@/components/store/product-breadcrumb";
import { StoreImage } from "@/components/store/store-image";
import { formatPrice, lowestPrice } from "@/lib/format/money";
import { Link, redirect, useLoaderData } from "react-router";
import { getCloudflareContext } from "@/lib/cloudflare-context";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { createPublicClient, getProductDetail } from "@/lib/catalog-queries";
import { getSiteUrl } from "@/lib/seo";
import type { Route } from "./+types/locale-product";

export async function loader({ params, context }: Route.LoaderArgs) {
  const locale = params.locale ?? "";
  const category = params.category ?? "";
  const slug = params.slug ?? "";
  if (!isLocale(locale)) {
    throw new Response("Not Found", { status: 404 });
  }
  const { env } = getCloudflareContext(context);
  const detail = await getProductDetail(
    createPublicClient(env),
    locale,
    slug,
    category,
  );
  if (!detail && category === "games") {
    const legacy = await getProductDetail(
      createPublicClient(env),
      locale,
      slug,
      null,
    );
    if (legacy)
      throw redirect(
        `/${locale}/${legacy.product.categorySlug}/${legacy.product.slug}`,
        301,
      );
  }
  if (!detail) {
    throw new Response("Not Found", { status: 404 });
  }
  return {
    locale,
    category,
    siteUrl: getSiteUrl(env),
    ...detail,
    offers: await withAdminOfferCosts(detail.offers),
  };
}

export function meta({ params, matches }: Route.MetaArgs) {
  const locale =
    params.locale && isLocale(params.locale) ? params.locale : DEFAULT_LOCALE;
  const match = matches.find((m) => m?.id === "routes/locale-product") as
    | {
        loaderData?: {
          product?: {
            name?: string;
            description?: string | null;
            imageUrl?: string | null;
          };
          category?: string;
          siteUrl?: string;
        };
      }
    | undefined;
  const product = match?.loaderData?.product;
  const category = match?.loaderData?.category ?? params.category ?? "";
  const slug = params.slug ?? "";
  return buildStorePageMeta(
    {
      locale,
      path: `/${category}/${slug}`,
      title: product?.name ?? "GH Store",
      description: product?.description ?? "",
      imageUrl: product?.imageUrl ?? null,
      siteUrl: match?.loaderData?.siteUrl ?? getSiteUrl(),
    },
    matches,
  );
}

export default function LocaleProduct() {
  const { locale, product, offers } = useLoaderData<typeof loader>();
  const common = getMessages(locale, "common");
  const catalog = getMessages(locale, "catalog");
  const cheapest = lowestPrice(offers);
  return <CatalogPage>
    <div className="sf-product-breadcrumb"><ProductBreadcrumb locale={locale} homeLabel={common.navigation.home} categorySlug={product.categorySlug} categoryName={product.categoryName ?? catalog.products.title} productName={product.name} /></div>
    <header className="sf-product-intro">
      <div className="sf-product-art"><StoreImage src={product.imageUrl ?? product.logoUrl} alt={product.name} priority focus={product.carouselFocus} sizes="(max-width: 719px) 104px, 180px" /></div>
      <div className="sf-product-intro-copy"><h1><bdi>{product.name}</bdi></h1><p>{catalog.gameDetail.chooseOffer}</p>
        <dl className="sf-product-facts">
          {product.categoryName ? <div><dt>{locale === "ar" ? "الفئة" : "Category"}</dt><dd>{product.categoryName}</dd></div> : null}
          {cheapest ? <div><dt>{common.price.from}</dt><dd><bdi dir="ltr">{formatPrice(cheapest.price, cheapest.currency, locale)}</bdi></dd></div> : null}
        </dl>
      </div>
    </header>
    <ProductOfferSelection key={product.id} locale={locale} product={product} offers={offers} />
  </CatalogPage>;
}

function ProductOfferSelection({ locale, product, offers }: { locale: Locale; product: StoreProduct; offers: StoreOffer[] }) {
  const [selectedId, setSelectedId] = useState(offers[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("");
  const filterQuery = useDeferredValue(query).trim().toLocaleLowerCase(locale);
  const selected = offers.find((offer) => offer.id === selectedId) ?? offers[0];
  const regions = [...new Set(offers.flatMap((offer) => offer.regionCode ? [offer.regionCode] : []))];
  const visibleOffers = offers.filter((offer) => (!region || offer.regionCode === region) && (!filterQuery || `${offer.name} ${offer.regionCode ?? ""}`.toLocaleLowerCase(locale).includes(filterQuery)));
  const common = getMessages(locale, "common");
  const catalog = getMessages(locale, "catalog");
  return <div className="sf-product-layout">
    <section className="sf-offers-panel" aria-labelledby="choose-offer-heading">
      <h2 id="choose-offer-heading">{locale === "ar" ? "اختر العرض المناسب" : "Choose your offer"}</h2>
      {offers.length ? <>
        <div className="sf-offer-filters">
          <label className="sf-offer-filter"><span>{locale === "ar" ? "البحث عن عرض" : "Find an offer"}</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={locale === "ar" ? "اسم العرض…" : "Search offers…"} /></label>
          {regions.length > 1 ? <label className="sf-offer-filter sf-offer-filter--region"><span>{catalog.offerDetail.regionLabel}</span><select value={region} onChange={(event) => setRegion(event.target.value)}><option value="">{locale === "ar" ? "كل المناطق" : "All regions"}</option>{regions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label> : null}
        </div>
        <fieldset className="sf-offer-choices"><legend className="sr-only">{catalog.gameDetail.chooseOffer}</legend>
          {visibleOffers.map((offer) => <div className="sf-offer-choice" key={offer.id} data-selected={offer.id === selected?.id}>
            <label className="sf-offer-choice-main">
              <input type="radio" name="selected-offer" value={offer.id} checked={offer.id === selected?.id} onChange={() => setSelectedId(offer.id)} />
              <span className="sf-offer-choice-art"><StoreImage src={product.logoUrl ?? offer.imageUrl ?? product.imageUrl} fit={product.logoUrl ? "contain" : "cover"} className={product.logoUrl ? "sf-catalog-logo" : undefined} alt="" sizes="56px" /></span>
              <span className="sf-offer-choice-copy"><strong><bdi>{offer.name}</bdi></strong><span className="sf-offer-choice-price"><bdi dir="ltr">{formatPrice(offer.price, offer.currency, locale)}</bdi></span>{offer.regionCode ? <small><bdi>{offer.regionCode}</bdi></small> : null}{typeof offer.supplierCostUsd === "number" ? <small>{common.price.capital}: <bdi dir="ltr">{formatPrice(offer.supplierCostUsd, "USD", locale)}</bdi></small> : null}</span>
            </label>
            <Link className="sf-offer-choice-detail" to={`/${locale}/${product.categorySlug}/${product.slug}/${offer.slug}`}>{locale === "ar" ? "تفاصيل العرض" : "Offer details"}</Link>
          </div>)}
        </fieldset>
        {visibleOffers.length === 0 ? <p role="status" className="sf-catalog-muted">{locale === "ar" ? "لا توجد عروض تطابق البحث. جرّب اسماً أو منطقة أخرى." : "No matching offers. Try another name or region."}</p> : null}
      </> : <EmptyState className="mt-5" title={catalog.gameDetail.emptyTitle} description={catalog.gameDetail.emptyDescription} action={{ href: `/${locale}/${product.categorySlug}`, label: product.categoryName ?? catalog.products.title }} />}
    </section>
    <PurchaseSummary locale={locale} product={product} offer={selected} />
    <div className="sf-product-details">
      {product.description ? <section><h2>{locale === "ar" ? "تفاصيل المنتج" : "Product details"}</h2><DescriptionText text={product.description} /></section> : null}
      <section><h2>{catalog.gameDetail.howItWorksHeading}</h2><ol className="sf-product-steps">{catalog.gameDetail.howItWorksSteps.map((step) => <li key={step}>{step}</li>)}</ol></section>
    </div>
  </div>;
}
