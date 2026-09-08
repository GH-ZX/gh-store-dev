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
import { getSaleOffersPage, tryCatalogRead } from "@/lib/services/catalog.service";

export async function generateMetadata({ params }: PageProps<"/[locale]/sale">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const messages = getMessages(locale, "catalog");

  return buildStorePageMetadata({
    locale,
    path: "/sale",
    title: messages.sale.title,
    description: messages.sale.description,
  });
}

export default async function SalePage({ params, searchParams }: PageProps<"/[locale]/sale">) {
  const locale = await resolveLocaleParam(params);
  const query = await searchParams;
  const page = parsePage(query.page, 1000);
  const common = getMessages(locale, "common");
  const messages = getMessages(locale, "catalog");
  const result = await tryCatalogRead(() => getSaleOffersPage(locale, page));

  if (!result.ok) {
    return (
      <Section spacing="page">
        <ErrorState
          title={messages.sale.errorTitle}
          description={messages.sale.errorDescription}
          action={{ href: `/${locale}`, label: common.actions.browse }}
        />
      </Section>
    );
  }

  const offers = result.data;

  if (page > offers.pages) {
    redirect(`/${locale}/sale?page=${offers.pages}`);
  }

  const pageHref = (target: number) => `/${locale}/sale?page=${target}`;

  return (
    <Section spacing="page" mesh>
      <SectionHeader
        as="h1"
        eyebrow={messages.sale.eyebrow}
        title={messages.sale.title}
        subtitle={messages.sale.description}
      />

      {offers.items.length === 0 ? (
        <EmptyState
          className="mt-10"
          title={messages.sale.emptyTitle}
          description={messages.sale.emptyDescription}
          action={{ href: `/${locale}/games`, label: common.navigation.games }}
        />
      ) : (
        <>
          <p className="mt-8 text-sm text-[var(--ink-muted)] tabular-nums">
            {formatMessage(messages.sale.count, { count: offers.total }, locale)}
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
