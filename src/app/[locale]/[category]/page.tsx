import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { ProductGrid } from "@/components/store/collections";
import { CategoryBreadcrumb } from "@/components/store/category-breadcrumb";
import { Section, SectionHeader } from "@/components/ui/section";
import { formatMessage, getMessages } from "@/i18n/messages";
import { getProductCardLabels } from "@/lib/catalog/labels";
import { resolveLocaleParam } from "@/lib/routing/locale-params";
import { buildStorePageMetadata } from "@/lib/seo-settings";
import { getProductsByCategory } from "@/lib/services/product-catalog.service";
import { tryCatalogRead } from "@/lib/services/catalog.service";

export async function generateMetadata({ params }: PageProps<"/[locale]/[category]">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const { category } = await params;
  const result = await tryCatalogRead(() => getProductsByCategory(locale, category));

  if (!result.ok || !result.data) {
    return {};
  }

  return buildStorePageMetadata({
    locale,
    path: `/${category}`,
    title: result.data.category.name,
    description: result.data.category.description ?? "",
  });
}

export default async function CategoryPage({ params }: PageProps<"/[locale]/[category]">) {
  const locale = await resolveLocaleParam(params);
  const { category } = await params;
  const common = getMessages(locale, "common");
  const messages = getMessages(locale, "catalog");
  const result = await tryCatalogRead(() => getProductsByCategory(locale, category));

  if (!result.ok) {
    return (
      <Section spacing="page">
        <ErrorState
          title={messages.category.errorTitle}
          description={messages.category.errorDescription}
          action={{ href: `/${locale}`, label: common.actions.browse }}
        />
      </Section>
    );
  }

  if (!result.data) {
    notFound();
  }

  const { category: item, products } = result.data;

  return (
    <Section spacing="page" mesh>
      <CategoryBreadcrumb
        locale={locale}
        homeLabel={common.navigation.home}
        productsHref={`/${locale}/products`}
        productsLabel={common.navigation.products}
        categoryName={item.name}
        navLabel={messages.products.eyebrow}
      />
      <SectionHeader
        className="mt-6"
        as="h1"
        eyebrow={messages.category.eyebrow}
        title={item.name}
        subtitle={item.description ?? undefined}
      />

      {products.length === 0 ? (
        <EmptyState
          className="mt-10"
          title={messages.category.emptyTitle}
          description={messages.category.emptyDescription}
        />
      ) : (
        <>
          <p className="mt-8 text-sm text-[var(--ink-muted)] tabular-nums">
            {formatMessage(messages.category.count, { count: products.length }, locale)}
          </p>
          <ProductGrid
            className="mt-4"
            games={products}
            locale={locale}
            labels={getProductCardLabels(common, messages)}
            priorityCount={0}
          />
        </>
      )}
    </Section>
  );
}
