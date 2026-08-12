import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { GameCard } from "@/components/store/game-card";
import { isLocale, type Locale } from "@/i18n/config";
import { getCommonMessages } from "@/i18n/messages";
import { CatalogReadError, getActiveGames } from "@/lib/services/catalog.service";
import { notFound } from "next/navigation";

type GamesPageProps = {
  params: Promise<{ locale: string }>;
};

export default async function GamesPage({ params }: GamesPageProps) {
  const { locale: rawLocale } = (await params) as { locale: string };

  if (!isLocale(rawLocale)) {
    notFound();
  }

  const locale = rawLocale as Locale;
  const messages = getCommonMessages(locale);
  let games;

  try {
    games = await getActiveGames(locale);
  } catch (error) {
    if (!(error instanceof CatalogReadError)) {
      throw error;
    }

    return (
      <section className="mx-auto w-full max-w-7xl px-5 py-14 sm:px-8 sm:py-20">
        <ErrorState title={messages.games.errorTitle} description={messages.games.errorDescription} />
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-7xl px-5 py-14 sm:px-8 sm:py-20">
      <div className="max-w-2xl">
        <p className="text-sm font-medium text-[var(--accent)]">{messages.games.eyebrow}</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-[var(--ink)] sm:text-6xl">{messages.games.title}</h1>
        <p className="mt-4 text-base leading-7 text-[var(--ink-soft)]">{messages.games.description}</p>
      </div>

      {games.length === 0 ? (
        <div className="mt-10"><EmptyState title={messages.games.emptyTitle} description={messages.games.emptyDescription} /></div>
      ) : (
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {games.map((game) => <GameCard key={game.id} game={game} locale={locale} />)}
        </div>
      )}
    </section>
  );
}
