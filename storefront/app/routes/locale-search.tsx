import { CatalogPage, CatalogHeading, CatalogNavigation } from "@/components/store/catalog-page";
import { withAdminOfferCosts } from "@server/lib/services/catalog-admin-costs.service";
import { buildStorePageMeta } from "@/lib/store-seo";
export { CatalogErrorBoundary as ErrorBoundary } from "@/components/store/catalog-error-boundary";
import { searchCatalog } from "@server/lib/services/catalog.service";
import { parseSearchParams } from "@/lib/catalog/search";
import { SearchField } from "@/components/search/search-field";
import { SearchFilters } from "@/components/search/search-filters";
import { ProductGrid, OfferGrid } from "@/components/store/collections";
import { EmptyState } from "@/components/shared/states";
import { getProductCardLabels, getOfferCardLabels } from "@/lib/catalog/labels";
import { useLoaderData } from "react-router";
import { getCloudflareContext } from "@/lib/cloudflare-context";
import { isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { createPublicClient } from "@/lib/catalog-queries";
import type { Route } from "./+types/locale-search";

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const locale = params.locale ?? "";
  if (!isLocale(locale)) {
    throw new Response("Not Found", { status: 404 });
  }
  const { env } = getCloudflareContext(context);
  const { query, filter } = parseSearchParams(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  const result = await searchCatalog(
    createPublicClient(env),
    locale,
    query,
    filter,
  );
  return {
    locale,
    query,
    filter,
    ...result,
    offers: await withAdminOfferCosts(result.offers),
  };
}

export function meta({ params, matches }: Route.MetaArgs) {
  const locale =
    params.locale && isLocale(params.locale) ? params.locale : "ar";
  const search = getMessages(locale, "search");
  return buildStorePageMeta(
    {
      locale,
      path: "/search",
      title: search.title,
      description: search.description,
      noIndex: true,
    },
    matches,
  );
}

export default function LocaleSearch() {
  const { locale, games: products, offers, query, filter } = useLoaderData<typeof loader>();
  const search = getMessages(locale, "search");
  const common = getMessages(locale, "common");
  const catalog = getMessages(locale, "catalog");
  return <CatalogPage>
    <CatalogHeading locale={locale} title={search.title} description={search.description} total={query ? products.length + offers.length : undefined} item="results" />
    <div className="sf-catalog-search-panel">
      <SearchField key={`${locale}:${query}:${filter}`} locale={locale} defaultQuery={query} filter={filter} labels={search} />
      <div className="sf-catalog-search-filters"><SearchFilters locale={locale} query={query} filter={filter} messages={search} /></div>
    </div>
    {query ? <p className="sf-catalog-muted mt-5">{locale === "ar" ? "نتائج البحث عن" : "Results for"} <strong><bdi>{query}</bdi></strong></p> : <div className="mt-6"><CatalogNavigation locale={locale} active="" /></div>}
    {products.length ? <section className="sf-catalog-result-section"><h2>{catalog.products.title}</h2><ProductGrid className="storefront-catalog-grid" games={products} locale={locale} labels={getProductCardLabels(common, catalog)} /></section> : null}
    {offers.length ? <section className="sf-catalog-result-section"><h2>{locale === "ar" ? "العروض" : "Offers"}</h2><OfferGrid className="storefront-offer-grid" offers={offers} locale={locale} labels={getOfferCardLabels(common, catalog)} /></section> : null}
    {query && !products.length && !offers.length ? <EmptyState className="mt-6" title={search.emptyTitle} description={search.emptyDescription} action={{ href: `/${locale}/products`, label: catalog.products.title }} /> : null}
  </CatalogPage>;
}
