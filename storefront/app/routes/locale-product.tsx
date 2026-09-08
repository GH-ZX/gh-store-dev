import { CatalogPage } from "@/components/store/catalog-page";
import type { StoreProduct } from "@/lib/catalog/product-mapper";
import { withAdminOfferCosts } from "@server/lib/services/catalog-admin-costs.service";
import { buildStorePageMeta } from "@/lib/store-seo";
export { CatalogErrorBoundary as ErrorBoundary } from "@/components/store/catalog-error-boundary";
import { ProductBreadcrumb } from "@/components/store/product-breadcrumb";
import { redirect, useLoaderData } from "react-router";
import { getCloudflareContext } from "@/lib/cloudflare-context";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { createPublicClient, getProductDetail } from "@/lib/catalog-queries";
import { productPath } from "@/lib/catalog/paths";
import { getRelatedProducts } from "@/lib/catalog/related-products";
import { ProductDetailHeader, ProductInformation, RelatedProductDiscovery } from "@/components/store/product-detail";
import { ProductOfferSelection } from "@/components/store/product-offer-selection";
import { buildBreadcrumbJsonLd, buildCatalogDescription, getSiteUrl } from "@/lib/seo";
import type { Route } from "./+types/locale-product";

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const locale = params.locale ?? "";
  const category = params.category ?? "";
  const slug = params.slug ?? "";
  if (!isLocale(locale)) {
    throw new Response("Not Found", { status: 404 });
  }
  const { env } = getCloudflareContext(context);
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
  const [offers, relatedProducts] = await Promise.all([
    withAdminOfferCosts(detail.offers),
    getRelatedProducts(client, locale, detail.product),
  ]);
  return {
    locale,
    category,
    siteUrl: getSiteUrl(env),
    ...detail,
    offers,
    relatedProducts,
  };
}

export function meta({ params, matches }: Route.MetaArgs) {
  const locale =
    params.locale && isLocale(params.locale) ? params.locale : DEFAULT_LOCALE;
  const match = matches.find((m) => m?.id === "routes/locale-product") as
    | {
        loaderData?: {
          product?: StoreProduct;
          category?: string;
          siteUrl?: string;
        };
      }
    | undefined;
  const product = match?.loaderData?.product;
  const category = match?.loaderData?.category ?? params.category ?? "";
  const path = `/${encodeURIComponent(category)}/${encodeURIComponent(product?.slug ?? params.slug ?? "")}`;
  const siteUrl = match?.loaderData?.siteUrl ?? getSiteUrl();
  const common = getMessages(locale, "common");
  return [
    ...buildStorePageMeta(
      {
        locale,
        path,
        title: product?.name ?? "GH Store",
        description: product ? buildCatalogDescription({ locale, productName: product.name, description: product.description }) : "",
        imageUrl: product?.imageUrl ?? product?.logoUrl ?? null,
        siteUrl,
      },
      matches,
    ),
    ...(product ? [{ "script:ld+json": buildBreadcrumbJsonLd({ locale, siteUrl, items: [
      { name: common.navigation.home, path: "" },
      { name: product.categoryName ?? common.navigation.allProducts, path: `/${encodeURIComponent(product.categorySlug)}` },
      { name: product.name, path },
    ] }) }] : []),
  ];
}

export default function LocaleProduct() {
  const { locale, product, offers, relatedProducts } = useLoaderData<typeof loader>();
  const common = getMessages(locale, "common");
  return <CatalogPage><div className="sf-detail-page">
    <ProductBreadcrumb locale={locale} homeLabel={common.navigation.home} categorySlug={product.categorySlug} categoryName={product.categoryName ?? common.navigation.allProducts} productName={product.name} />
    <ProductDetailHeader locale={locale} product={product} offers={offers} />
    <ProductOfferSelection key={product.id} locale={locale} product={product} offers={offers} />
    <ProductInformation locale={locale} product={product} />
    <RelatedProductDiscovery locale={locale} product={product} related={relatedProducts} />
  </div></CatalogPage>;
}
