import type { StoreOffer } from "@/lib/catalog/offer-mapper";
import { CatalogPage } from "@/components/store/catalog-page";
import type { StoreProduct } from "@/lib/catalog/product-mapper";
import { withAdminOfferCosts } from "@server/lib/services/catalog-admin-costs.service";
import { buildStorePageMeta } from "@/lib/store-seo";
export { CatalogErrorBoundary as ErrorBoundary } from "@/components/store/catalog-error-boundary";
import { ProductBreadcrumb } from "@/components/store/product-breadcrumb";
import { useEffect } from "react";
import { redirect, useLoaderData } from "react-router";
import { recordRecentlyViewed } from "@/components/home/recently-viewed-rail";
import { getCloudflareContext } from "@/lib/cloudflare-context";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { createPublicClient, getProductDetail, getProductOrdering } from "@/lib/catalog-queries";
import { productPath } from "@/lib/catalog/paths";
import { getRelatedProducts } from "@/lib/catalog/related-products";
import { ProductDetailHeader, ProductInformation, RelatedProductDiscovery } from "@/components/store/product-detail";
import { ProductOfferSelection } from "@/components/store/product-offer-selection";
import { buildBreadcrumbJsonLd, buildCatalogDescription, getSiteUrl } from "@/lib/seo";
import { buildOfferListJsonLd, buildProductJsonLd } from "@/lib/catalog/structured-data";
import { buildBuyingNotes, buildProductDescription } from "@/lib/catalog/buying-notes";
import { regionQualifiedName, regionQualifiedTitle } from "@/components/store/region-notice";
import { checkOffersFreshness } from "@server/lib/services/catalog-freshness.service";
import type { Route } from "./+types/locale-product";

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const locale = params.locale ?? "";
  const category = params.category ?? "";
  const slug = params.slug ?? "";
  if (!isLocale(locale)) {
    throw new Response("Not Found", { status: 404 });
  }
  const { env, ctx } = getCloudflareContext(context);
  const client = createPublicClient(env);
  const detail = await getProductDetail(
    client,
    locale,
    slug,
    null,
  );
  if (!detail) {
    throw new Response("Not Found", { status: 404 });
  }
  // Category changes must preserve shared links and search results. Resolve
  // the globally unique product once, then send old paths to its current URL.
  if (category !== detail.product.categorySlug) {
    throw redirect(`${productPath(locale, detail.product)}${new URL(request.url).search}`, 301);
  }
  const [offers, relatedProducts, ordering] = await Promise.all([
    withAdminOfferCosts(detail.offers),
    getRelatedProducts(client, locale, detail.product),
    getProductOrdering(client, detail.product.id, detail.offers),
  ]);
  // Original, region-aware buying content composed from the catalog's own facts.
  const buyingNotes = buildBuyingNotes({
    locale,
    product: detail.product,
    deliveryKind: ordering.deliveryKind,
    inputFieldKeys: ordering.inputFieldKeys,
  });
  const generatedDescription = detail.product.description?.trim()
    ? detail.product.description
    : buildProductDescription({
        locale,
        product: detail.product,
        deliveryKind: ordering.deliveryKind,
        inputFieldKeys: ordering.inputFieldKeys,
      });
  // Read-path freshness: ask the supplier about the packages on this page,
  // through a short-TTL cache, and refresh behind the response rather than
  // delaying it. A failure here is reported as "unverified", never as stock.
  const availability = await checkOffersFreshness(client, offers, {
    schedule: (promise) => ctx.waitUntil(promise),
  });
  return {
    locale,
    category,
    siteUrl: getSiteUrl(env),
    ...detail,
    offers,
    relatedProducts,
    availability: Object.fromEntries(availability),
    buyingNotes,
    generatedDescription,
  };
}

export function meta({ params, matches }: Route.MetaArgs) {
  const locale =
    params.locale && isLocale(params.locale) ? params.locale : DEFAULT_LOCALE;
  const match = matches.find((m) => m?.id === "routes/locale-product") as
    | {
        loaderData?: {
          product?: StoreProduct;
          offers?: StoreOffer[];
          category?: string;
          siteUrl?: string;
          generatedDescription?: string;
        };
      }
    | undefined;
  const product = match?.loaderData?.product;
  const offers = match?.loaderData?.offers ?? [];
  const generatedDescription = match?.loaderData?.generatedDescription ?? "";
  const category = match?.loaderData?.category ?? params.category ?? "";
  const path = `/${encodeURIComponent(category)}/${encodeURIComponent(product?.slug ?? params.slug ?? "")}`;
  const siteUrl = match?.loaderData?.siteUrl ?? getSiteUrl();
  const common = getMessages(locale, "common");

  // The title and H1 carry the region, because "Mobile Legends Special" and
  // "Mobile Legends Exclusive" are separate regional packages a shopper cannot
  // tell apart from the brand name alone.
  const title = product ? regionQualifiedTitle(product, locale) : "GH Store";
  const description = product
    ? buildCatalogDescription({
        locale,
        productName: regionQualifiedName(product, locale),
        description: product.description?.trim() ? product.description : generatedDescription,
      })
    : "";

  const itemList = product && offers.length > 0
    ? buildOfferListJsonLd({
        locale,
        siteUrl,
        product: { slug: product.slug, categorySlug: product.categorySlug, name: regionQualifiedName(product, locale), pointsName: product.pointsName },
        offers,
      })
    : null;
  const productData = product
    ? buildProductJsonLd({
        locale,
        siteUrl,
        product: {
          slug: product.slug,
          categorySlug: product.categorySlug,
          name: regionQualifiedName(product, locale),
          description: product.description,
          categoryName: product.categoryName,
        },
        offers,
        imageUrl: product.imageUrl ?? product.logoUrl,
      })
    : null;

  return [
    ...buildStorePageMeta(
      {
        locale,
        path,
        title,
        description,
        imageUrl: product?.imageUrl ?? product?.logoUrl ?? null,
        siteUrl,
      },
      matches,
    ),
    ...(itemList ? [{ "script:ld+json": itemList }] : []),
    ...(productData ? [{ "script:ld+json": productData }] : []),
    ...(product ? [{ "script:ld+json": buildBreadcrumbJsonLd({ locale, siteUrl, items: [
      { name: common.navigation.home, path: "" },
      { name: product.categoryName ?? common.navigation.allProducts, path: `/${encodeURIComponent(product.categorySlug)}` },
      { name: regionQualifiedName(product, locale), path },
    ] }) }] : []),
  ];
}

export default function LocaleProduct() {
  const { locale, product, offers, relatedProducts, availability } = useLoaderData<typeof loader>();
  const common = getMessages(locale, "common");

  useEffect(() => {
    if (product) {
      recordRecentlyViewed({
        id: product.id,
        slug: product.slug,
        categorySlug: product.categorySlug,
        name: regionQualifiedName(product, locale),
        imageUrl: product.imageUrl ?? product.logoUrl,
        priceFrom: product.priceFrom,
      });
    }
  }, [product, locale]);

  return <CatalogPage><div className="sf-detail-page">
    <ProductBreadcrumb locale={locale} homeLabel={common.navigation.home} categorySlug={product.categorySlug} categoryName={product.categoryName ?? common.navigation.allProducts} productName={regionQualifiedName(product, locale)} />
    <ProductDetailHeader locale={locale} product={product} offers={offers} availability={availability} />
    <ProductOfferSelection key={product.id} locale={locale} product={product} offers={offers} availability={availability} related={relatedProducts.products} />
    <ProductInformation locale={locale} product={product} />
    <RelatedProductDiscovery locale={locale} product={product} related={relatedProducts} />
  </div></CatalogPage>;
}
