import { CatalogPage, CatalogHeading, CatalogNavigation } from "@/components/store/catalog-page";
import { withAdminOfferCosts } from "@server/lib/services/catalog-admin-costs.service";
import { buildStorePageMeta } from "@/lib/store-seo";
export { CatalogErrorBoundary as ErrorBoundary } from "@/components/store/catalog-error-boundary";
import { searchCatalog } from "@server/lib/services/catalog.service";
import { buildSearchPath, parseSearchParams } from "@/lib/catalog/search";
import { SearchField } from "@/components/search/search-field";
import { SearchFilters } from "@/components/search/search-filters";
import { ProductGrid, OfferGrid } from "@/components/store/collections";
import { EmptyState } from "@/components/shared/states";
import { SearchIcon } from "@/components/ui/icons";
import { getProductCardLabels, getOfferCardLabels } from "@/lib/catalog/labels";
import { useLoaderData, useNavigation } from "react-router";
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
  const navigation = useNavigation();
  const pending = navigation.state !== "idle" && navigation.location?.pathname === `/${locale}/search`;
  return <CatalogPage>
    <CatalogHeading locale={locale} title={search.title} description={search.description} total={query ? products.length + offers.length : undefined} item="results" />
    <div className="sf-catalog-search-panel">
      <SearchField key={`${locale}:${query}:${filter}`} locale={locale} defaultQuery={query} filter={filter} labels={search} className="sf-search" />
      <div className="sf-catalog-search-filters"><SearchFilters locale={locale} query={query} filter={filter} messages={search} /></div>
    </div>
    <p className="sf-catalog-muted sf-search-feedback" role="status" aria-atomic="true">
      {pending ? common.states.loading : query ? <>{search.resultsLabel} <strong><bdi>{query}</bdi></strong></> : null}
    </p>
    <div aria-busy={pending} className="sf-search-results">
      {!query ? <>
        <div className="sf-search-prompt">
          <SearchIcon className="size-6" />
          <div><h2>{search.promptTitle}</h2><p>{search.promptDescription}</p></div>
        </div>
        <CatalogNavigation locale={locale} active="" />
      </> : null}
      {products.length ? <section className="sf-catalog-result-section"><h2>{search.productsHeading}</h2><ProductGrid className="storefront-catalog-grid" games={products} locale={locale} labels={getProductCardLabels(common, catalog)} /></section> : null}
      {offers.length ? <section className="sf-catalog-result-section"><h2>{search.offersHeading}</h2><OfferGrid className="storefront-offer-grid" offers={offers} locale={locale} labels={getOfferCardLabels(common, catalog)} /></section> : null}
      {query && !products.length && !offers.length ? <EmptyState className="mt-6" title={search.emptyTitle} description={filter === "all" ? search.emptyDescription : search.filteredEmptyDescription} action={filter === "all" ? { href: `/${locale}/products`, label: common.navigation.allProducts } : { href: buildSearchPath(locale, { query }), label: search.clearFilters }} /> : null}
    </div>
  </CatalogPage>;
}
