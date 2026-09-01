import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { ProductGrid } from "@/components/store/collections";
import { Pager } from "@/components/admin/pager";
import { Section, SectionHeader } from "@/components/ui/section";
import { formatMessage, getMessages } from "@/i18n/messages";
import { getProductCardLabels } from "@/lib/catalog/labels";
import { resolveLocaleParam } from "@/lib/routing/locale-params";
import { buildStorePageMetadata } from "@/lib/seo-settings";
import { parsePage } from "@/lib/paging";
import { getActiveProductsPage, tryCatalogRead } from "@/lib/services/catalog.service";

export async function generateMetadata({ params }: PageProps<"/[locale]/games">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const messages = getMessages(locale, "catalog");

  return buildStorePageMetadata({
    locale,
    path: "/games",
    title: messages.games.title,
    description: messages.games.description,
  });
}

export default async function GamesPage({ params, searchParams }: PageProps<"/[locale]/games">) {
  const locale = await resolveLocaleParam(params);
  const query = await searchParams;
  const page = parsePage(query.page, 1000);
  const common = getMessages(locale, "common");
  const messages = getMessages(locale, "catalog");
  const result = await tryCatalogRead(() => getActiveProductsPage(locale, page));

  if (!result.ok) {
    return (
      <Section spacing="page">
        <ErrorState
          title={messages.games.errorTitle}
          description={messages.games.errorDescription}
          action={{ href: `/${locale}`, label: common.actions.browse }}
        />
      </Section>
    );
  }

  const games = result.data;

  if (page > games.pages) {
    redirect(`/${locale}/games?page=${games.pages}`);
  }

  const pageHref = (target: number) => `/${locale}/games?page=${target}`;

  return (
    <Section spacing="page" mesh>
      <SectionHeader
        as="h1"
        eyebrow={messages.games.eyebrow}
        title={messages.games.title}
        subtitle={messages.games.description}
      />

      {games.items.length === 0 ? (
        <EmptyState
          className="mt-10"
          title={messages.games.emptyTitle}
          description={messages.games.emptyDescription}
        />
      ) : (
        <>
          <p className="mt-8 text-sm text-[var(--ink-muted)] tabular-nums">
            {formatMessage(messages.games.count, { count: games.total }, locale)}
          </p>
          <ProductGrid
            className="mt-4"
            games={games.items}
            locale={locale}
            labels={getProductCardLabels(common)}
            priorityCount={5}
          />
          <div className="mt-8">
            <Pager
              locale={locale}
              hrefFor={pageHref}
              page={games.page}
              pages={games.pages}
              labels={common.pagination}
            />
          </div>
        </>
      )}
    </Section>
  );
}
