import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { OfferGrid } from "@/components/store/collections";
import { Pager } from "@/components/admin/pager";
import { Section, SectionHeader } from "@/components/ui/section";
import { formatMessage, getMessages } from "@/i18n/messages";
import { getOfferCardLabels } from "@/lib/catalog/labels";
import { parsePage } from "@/lib/paging";
import { resolveLocaleParam } from "@/lib/routing/locale-params";
import { buildStorePageMetadata } from "@/lib/seo-settings";
import { getBestSellersPage, tryCatalogRead } from "@/lib/services/catalog.service";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/best-sellers">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const messages = getMessages(locale, "catalog");

  return buildStorePageMetadata({
    locale,
    path: "/best-sellers",
    title: messages.bestSellers.title,
    description: messages.bestSellers.description,
  });
}

export default async function BestSellersPage({ params, searchParams }: PageProps<"/[locale]/best-sellers">) {
  const locale = await resolveLocaleParam(params);
  const query = await searchParams;
  const page = parsePage(query.page, 1000);
  const common = getMessages(locale, "common");
  const messages = getMessages(locale, "catalog");
  const result = await tryCatalogRead(() => getBestSellersPage(locale, page));

  if (!result.ok) {
    return (
      <Section spacing="page">
        <ErrorState
          title={messages.bestSellers.errorTitle}
          description={messages.bestSellers.errorDescription}
          action={{ href: `/${locale}`, label: common.actions.browse }}
        />
      </Section>
    );
  }

  const offers = result.data;

  if (page > offers.pages) {
    redirect(`/${locale}/best-sellers?page=${offers.pages}`);
  }

  const pageHref = (target: number) => `/${locale}/best-sellers?page=${target}`;

  return (
    <Section spacing="page" mesh>
      <SectionHeader
        as="h1"
        eyebrow={messages.bestSellers.eyebrow}
        title={messages.bestSellers.title}
        subtitle={messages.bestSellers.description}
      />

      {offers.items.length === 0 ? (
        <EmptyState
          className="mt-10"
          title={messages.bestSellers.emptyTitle}
          description={messages.bestSellers.emptyDescription}
          action={{ href: `/${locale}`, label: common.actions.browse }}
        />
      ) : (
        <>
          <p className="mt-8 text-sm text-[var(--ink-muted)] tabular-nums">
            {formatMessage(messages.bestSellers.count, { count: offers.total }, locale)}
          </p>
          <OfferGrid
            className="mt-4"
            offers={offers.items}
            locale={locale}
            labels={getOfferCardLabels(common, messages)}
          />
          <div className="mt-8">
            <Pager
              locale={locale}
              hrefFor={pageHref}
              page={offers.page}
              pages={offers.pages}
              labels={common.pagination}
            />
          </div>
        </>
      )}
    </Section>
  );
}
