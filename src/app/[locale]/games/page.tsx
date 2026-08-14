import type { Metadata } from "next";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { GameGrid } from "@/components/store/collections";
import { Section, SectionHeader } from "@/components/ui/section";
import { formatMessage, getMessages } from "@/i18n/messages";
import { getGameCardLabels } from "@/lib/catalog/labels";
import { resolveLocaleParam } from "@/lib/routing/locale-params";
import { buildStorePageMetadata } from "@/lib/seo-settings";
import { getActiveGames, tryCatalogRead } from "@/lib/services/catalog.service";

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

export default async function GamesPage({ params }: PageProps<"/[locale]/games">) {
  const locale = await resolveLocaleParam(params);
  const common = getMessages(locale, "common");
  const messages = getMessages(locale, "catalog");
  const result = await tryCatalogRead(() => getActiveGames(locale));

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

  return (
    <Section spacing="page" mesh>
      <SectionHeader
        as="h1"
        eyebrow={messages.games.eyebrow}
        title={messages.games.title}
        subtitle={messages.games.description}
      />

      {games.length === 0 ? (
        <EmptyState
          className="mt-10"
          title={messages.games.emptyTitle}
          description={messages.games.emptyDescription}
        />
      ) : (
        <>
          <p className="mt-8 text-sm text-[var(--ink-muted)] tabular-nums">
            {formatMessage(messages.games.count, { count: games.length }, locale)}
          </p>
          <GameGrid
            className="mt-4"
            games={games}
            locale={locale}
            labels={getGameCardLabels(common)}
            priorityCount={5}
          />
        </>
      )}
    </Section>
  );
}
