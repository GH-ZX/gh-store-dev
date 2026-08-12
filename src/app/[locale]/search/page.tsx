import type { Metadata } from "next";
import { SearchField } from "@/components/search/search-field";
import { SearchFilters } from "@/components/search/search-filters";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { GameGrid, OfferGrid } from "@/components/store/collections";
import { SearchIcon } from "@/components/ui/icons";
import { Section, SectionHeader } from "@/components/ui/section";
import { formatMessage, getMessages } from "@/i18n/messages";
import { getGameCardLabels, getOfferCardLabels } from "@/lib/catalog/labels";
import { parseSearchParams } from "@/lib/catalog/search";
import { resolveLocaleParam } from "@/lib/routing/locale-params";
import { buildPageMetadata } from "@/lib/seo";
import { CatalogReadError, searchCatalog } from "@/lib/services/catalog.service";

export async function generateMetadata({ params }: PageProps<"/[locale]/search">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const messages = getMessages(locale, "search");

  return buildPageMetadata({
    locale,
    path: "/search",
    title: messages.title,
    description: messages.description,
    // Result pages are thin, near-duplicate content; the catalog pages are the
    // ones worth indexing.
    noIndex: true,
  });
}

export default async function SearchPage({ params, searchParams }: PageProps<"/[locale]/search">) {
  const locale = await resolveLocaleParam(params);
  const common = getMessages(locale, "common");
  const messages = getMessages(locale, "search");
  const { query, filter } = parseSearchParams(await searchParams);

  const header = (
    <>
      <SectionHeader
        as="h1"
        eyebrow={messages.eyebrow}
        title={query ? formatMessage(messages.resultsFor, { query }, locale) : messages.title}
        subtitle={messages.description}
      />

      <div className="mt-8 grid gap-4">
        {/*
         * Keyed on the query so a new search — or a back/forward navigation —
         * remounts the field with the URL's value instead of keeping stale text.
         */}
        <SearchField
          key={query}
          locale={locale}
          defaultQuery={query}
          filter={filter}
          autoFocus={!query}
          className="max-w-xl"
          labels={{
            fieldLabel: messages.fieldLabel,
            placeholder: messages.placeholder,
            submit: messages.submit,
            clear: messages.clear,
          }}
        />
        <SearchFilters locale={locale} query={query} filter={filter} messages={messages} />
      </div>
    </>
  );

  if (!query) {
    return (
      <Section spacing="page" mesh>
        {header}
        <EmptyState
          className="mt-10"
          icon={<SearchIcon />}
          title={messages.promptTitle}
          description={messages.promptDescription}
          action={{ href: `/${locale}/games`, label: common.navigation.games }}
        />
      </Section>
    );
  }

  let results;

  try {
    results = await searchCatalog(locale, query, filter);
  } catch (error) {
    if (!(error instanceof CatalogReadError)) {
      throw error;
    }

    return (
      <Section spacing="page" mesh>
        {header}
        <ErrorState className="mt-10" title={messages.errorTitle} description={messages.errorDescription} />
      </Section>
    );
  }

  const total = results.games.length + results.offers.length;

  return (
    <Section spacing="page" mesh>
      {header}

      {total === 0 ? (
        <EmptyState
          className="mt-10"
          icon={<SearchIcon />}
          title={messages.emptyTitle}
          description={messages.emptyDescription}
          action={{ href: `/${locale}/games`, label: common.navigation.games }}
        />
      ) : (
        <div className="mt-12 grid gap-14">
          {results.games.length > 0 ? (
            <div>
              <SectionHeader
                title={messages.gamesHeading}
                subtitle={formatMessage(messages.gamesCount, { count: results.games.length }, locale)}
              />
              <GameGrid
                className="mt-6"
                games={results.games}
                locale={locale}
                labels={getGameCardLabels(common)}
                priorityCount={5}
              />
            </div>
          ) : null}

          {results.offers.length > 0 ? (
            <div>
              <SectionHeader
                title={messages.offersHeading}
                subtitle={formatMessage(messages.offersCount, { count: results.offers.length }, locale)}
              />
              <OfferGrid
                className="mt-6"
                offers={results.offers}
                locale={locale}
                labels={getOfferCardLabels(common, getMessages(locale, "catalog"))}
              />
            </div>
          ) : null}
        </div>
      )}
    </Section>
  );
}
