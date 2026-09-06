import { CatalogPage, CatalogHeading, CatalogNavigation, CatalogToolbar, CatalogPager } from "@/components/store/catalog-page";
import { buildStorePageMeta } from "@/lib/store-seo";
export { CatalogErrorBoundary as ErrorBoundary } from "@/components/store/catalog-error-boundary";
import { ProductGrid } from "@/components/store/collections";
import { EmptyState } from "@/components/shared/states";
import { getProductCardLabels } from "@/lib/catalog/labels";
import { redirect, useLoaderData } from "react-router";
import { isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { getCloudflareContext } from "@/lib/cloudflare-context";
import { createPublicClient, getAllProductsPage } from "@/lib/catalog-queries";
import type { Route } from "./+types/locale-products";

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const locale = params.locale ?? "";
  if (!isLocale(locale)) {
    throw new Response("Not Found", { status: 404 });
  }
  const { env } = getCloudflareContext(context);
  const client = createPublicClient(env);
  const page = Number(new URL(request.url).searchParams.get("page") ?? "1");
  const [catalog, categoriesResult] = await Promise.all([
    getAllProductsPage(client, locale, page),
    client
      .from("categories")
      .select("id,slug,name_ar,name_en")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
  ]);
  const categories = (categoriesResult.data ?? []).map((category) => ({
    id: String(category.id),
    slug: String(category.slug),
    name: String(locale === "ar" ? category.name_ar : category.name_en),
  }));
  if (catalog.page > Math.max(1, Math.ceil(catalog.total / catalog.pageSize)))
    throw redirect(`/${locale}/products`);
  return { locale, catalog, categories };
}

export function meta({ params, matches }: Route.MetaArgs) {
  const locale =
    params.locale && isLocale(params.locale) ? params.locale : "ar";
  const catalog = getMessages(locale, "catalog");
  return buildStorePageMeta(
    {
      locale,
      path: "/products",
      title: catalog.products.title,
      description: catalog.products.description,
    },
    matches,
  );
}

export default function LocaleProducts() {
  const loaded = useLoaderData<typeof loader>();
  const { locale } = loaded;
  const { products, total, page, pageSize } = loaded.catalog;
  const common = getMessages(locale, "common");
  const catalog = getMessages(locale, "catalog");
  const copy = catalog.products;
  return <CatalogPage>
    <CatalogHeading locale={locale} title={copy.title} description={copy.description} total={total} />
    <CatalogNavigation locale={locale} active="products" />
    <CatalogToolbar locale={locale} categories={loaded.categories} />
    {products.length ? <ProductGrid className="storefront-catalog-grid" games={products} locale={locale} labels={getProductCardLabels(common, catalog)} priorityCount={5} /> : <EmptyState title={common.states.emptyTitle} description={common.states.emptyDescription} />}
    <CatalogPager locale={locale} path="products" page={page} pageSize={pageSize} total={total} />
  </CatalogPage>;
}
