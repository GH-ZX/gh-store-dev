import { GameCard } from "@/components/store/game-card";
import { OfferCard, type OfferCardLabels } from "@/components/store/offer-card";
import { Rail, RailItem } from "@/components/ui/rail";
import type { Locale } from "@/i18n/config";
import type { StoreGame } from "@/lib/catalog/game-mapper";
import type { StoreOffer } from "@/lib/catalog/offer-mapper";
import { cn } from "@/lib/cn";

/**
 * Catalog collections.
 *
 * `grid` wraps into rows and is the right choice for a full listing page.
 * `rail` scrolls horizontally and suits a homepage row that previews a larger
 * page.
 */

export type CollectionLayout = "grid" | "rail";

export type OfferCollectionProps = {
  offers: StoreOffer[];
  locale: Locale;
  labels: OfferCardLabels;
  layout?: CollectionLayout;
  /** Accessible name for a rail's scrollable region; required for `rail`. */
  railLabel?: string;
  gameSlug?: string;
  showGameName?: boolean;
  className?: string;
};

export function OfferGrid({
  offers,
  locale,
  labels,
  layout = "grid",
  railLabel,
  gameSlug,
  showGameName = true,
  className,
}: OfferCollectionProps) {
  if (layout === "rail" && railLabel) {
    return (
      <Rail label={railLabel} itemWidth="md" className={className}>
        {offers.map((offer) => (
          <RailItem key={offer.id}>
            <OfferCard
              offer={offer}
              locale={locale}
              labels={labels}
              gameSlug={gameSlug}
              showGameName={showGameName}
            />
          </RailItem>
        ))}
      </Rail>
    );
  }

  return (
    <ul className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4", className)}>
      {offers.map((offer) => (
        <li key={offer.id}>
          <OfferCard
            offer={offer}
            locale={locale}
            labels={labels}
            gameSlug={gameSlug}
            showGameName={showGameName}
          />
        </li>
      ))}
    </ul>
  );
}

export type GameCollectionProps = {
  games: StoreGame[];
  locale: Locale;
  labels: { featured: string; from?: string };
  layout?: CollectionLayout;
  railLabel?: string;
  /** How many leading tiles load eagerly, for above-the-fold rows. */
  priorityCount?: number;
  className?: string;
};

export function GameGrid({
  games,
  locale,
  labels,
  layout = "grid",
  railLabel,
  priorityCount = 0,
  className,
}: GameCollectionProps) {
  if (layout === "rail" && railLabel) {
    return (
      <Rail label={railLabel} itemWidth="sm" className={className}>
        {games.map((game, index) => (
          <RailItem key={game.id}>
            <GameCard game={game} locale={locale} labels={labels} priority={index < priorityCount} />
          </RailItem>
        ))}
      </Rail>
    );
  }

  return (
    <ul className={cn("grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5", className)}>
      {games.map((game, index) => (
        <li key={game.id}>
          <GameCard game={game} locale={locale} labels={labels} priority={index < priorityCount} />
        </li>
      ))}
    </ul>
  );
}
