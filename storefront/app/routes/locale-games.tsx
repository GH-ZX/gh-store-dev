import { CatalogPage, CatalogHeading, CatalogNavigation, CatalogToolbar, CatalogPager } from "@/components/store/catalog-page";
import { buildStorePageMeta } from "@/lib/store-seo";
export { CatalogErrorBoundary as ErrorBoundary } from "@/components/store/catalog-error-boundary";
import { ProductGrid } from "@/components/store/collections";
import { EmptyState } from "@/components/shared/states";
import { getProductCardLabels } from "@/lib/catalog/labels";
import { redirect, useLoaderData } from "react-router";
import { getCloudflareContext } from "@/lib/cloudflare-context";
import { isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { createPublicClient, getCatalogPage } from "@/lib/catalog-queries";
import { getSiteUrl } from "@/lib/seo";
import type { Route } from "./+types/locale-games";

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const locale = params.locale ?? "";
  if (!isLocale(locale)) {
    throw new Response("Not Found", { status: 404 });
  }
  const { env } = getCloudflareContext(context);
  const page = Number(new URL(request.url).searchParams.get("page") ?? "1");
  const catalog = await getCatalogPage(createPublicClient(env), locale, page);
  if (catalog.page > Math.max(1, Math.ceil(catalog.total / catalog.pageSize)))
    throw redirect(`/${locale}/games`);
  return { locale, siteUrl: getSiteUrl(env), ...catalog };
}

export function meta({ params, matches }: Route.MetaArgs) {
  const locale =
    params.locale && isLocale(params.locale) ? params.locale : "ar";
  const catalog = getMessages(locale, "catalog");
  const match = matches.find((item) => item?.id === "routes/locale-games") as
    | { loaderData?: { page?: number } }
    | undefined;
  return buildStorePageMeta(
    {
      locale,
      path: "/games",
      page: match?.loaderData?.page,
      title: catalog.games.title,
      description: catalog.games.description,
    },
    matches,
  );
}

export default function LocaleGames() {
  const loaded = useLoaderData<typeof loader>();
  const { locale } = loaded;
  const { products, total, page, pageSize } = loaded;
  const common = getMessages(locale, "common");
  const catalog = getMessages(locale, "catalog");
  const copy = catalog.games;
  return <CatalogPage>
    <CatalogHeading locale={locale} title={copy.title} description={copy.description} total={total} />
    <CatalogNavigation locale={locale} active="games" />
    <CatalogToolbar locale={locale} filter="topup" />
    {products.length ? <ProductGrid className="storefront-catalog-grid" games={products} locale={locale} labels={getProductCardLabels(common, catalog)} priorityCount={5} /> : <EmptyState title={common.states.emptyTitle} description={common.states.emptyDescription} />}
    <CatalogPager locale={locale} path="games" page={page} pageSize={pageSize} total={total} />
  </CatalogPage>;
}
