import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { ProductGrid } from "@/components/store/collections";
import { Section, SectionHeader } from "@/components/ui/section";
import { formatMessage, getMessages } from "@/i18n/messages";
import { getProductCardLabels } from "@/lib/catalog/labels";
import { getProductCatalog } from "@/lib/services/product-catalog.service";
import { tryCatalogRead } from "@/lib/services/catalog.service";
import { resolveLocaleParam } from "@/lib/routing/locale-params";
import { buildStorePageMetadata } from "@/lib/seo-settings";

export async function generateMetadata({ params }: PageProps<"/[locale]/products">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const messages = getMessages(locale, "catalog");

  return buildStorePageMetadata({
    locale,
    path: "/products",
    title: messages.products.title,
    description: messages.products.description,
  });
}

export default async function ProductsPage({ params }: PageProps<"/[locale]/products">) {
  const locale = await resolveLocaleParam(params);
  const common = getMessages(locale, "common");
  const messages = getMessages(locale, "catalog");
  const result = await tryCatalogRead(() => getProductCatalog(locale));

  if (!result.ok) {
    return (
      <Section spacing="page">
        <ErrorState
          title={messages.products.errorTitle}
          description={messages.products.errorDescription}
          action={{ href: `/${locale}`, label: common.actions.browse }}
        />
      </Section>
    );
  }

  const { categories, products } = result.data;

  return (
    <Section spacing="page" mesh>
      <SectionHeader
        as="h1"
        eyebrow={messages.products.eyebrow}
        title={messages.products.title}
        subtitle={messages.products.description}
      />

      {categories.length > 0 ? (
        <nav aria-label={messages.products.categoriesHeading} className="mt-8">
          <h2 className="text-sm font-semibold text-[var(--ink)]">{messages.products.categoriesHeading}</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {categories.map((category) => (
              <li key={category.id}>
                <Link
                  href={`/${locale}/${category.slug}`}
                  className="inline-flex min-h-10 items-center rounded-[var(--radius-pill)] border border-[var(--line)] bg-[var(--shell)] px-4 text-sm font-semibold text-[var(--ink-soft)] transition-colors duration-[var(--duration)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
                >
                  {category.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      {products.length === 0 ? (
        <EmptyState
          className="mt-10"
          title={messages.products.emptyTitle}
          description={messages.products.emptyDescription}
        />
      ) : (
        <>
          <p className="mt-8 text-sm text-[var(--ink-muted)] tabular-nums">
            {formatMessage(messages.products.count, { count: products.length }, locale)}
          </p>
          <ProductGrid
            className="mt-4"
            games={products}
            locale={locale}
            labels={getProductCardLabels(common, messages)}
            priorityCount={5}
          />
        </>
      )}
    </Section>
  );
}
