import type { ReactNode } from "react";
import { ProductCard } from "@/components/store/product-card";
import { OfferCard, type OfferCardLabels } from "@/components/store/offer-card";
import { Rail, RailItem } from "@/components/ui/rail";
import type { Locale } from "@/i18n/config";
import { formatPrice } from "@/lib/format/money";
import type { StoreProduct } from "@/lib/catalog/product-mapper";
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

/**
 * The tile's teaser price, when the read enriched the game with one.
 * A game without active offers renders no line rather than a fake number.
 */
function priceTeaser(
  game: StoreProduct,
  labels: { from?: string },
  locale: Locale,
): string | undefined {
  if (typeof game.priceFrom !== "number" || !labels.from) {
    return undefined;
  }

  return `${labels.from} ${formatPrice(game.priceFrom, "USD", locale)}`;
}

export type OfferCollectionProps = {
  offers: StoreOffer[];
  locale: Locale;
  labels: OfferCardLabels;
  layout?: CollectionLayout;
  /** Accessible name for a rail's scrollable region; required for `rail`. */
  railLabel?: string;
  gameSlug?: string;
  showGameName?: boolean;
  /** Compact rows without artwork, for a list inside a single game. */
  compact?: boolean;
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
  compact = false,
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
              compact={compact}
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
            compact={compact}
          />
        </li>
      ))}
    </ul>
  );
}

export type GameCollectionProps = {
  games: StoreProduct[];
  locale: Locale;
  labels: { featured: string; from?: string };
  layout?: CollectionLayout;
  railLabel?: string;
  /** How many leading tiles load eagerly, for above-the-fold rows. */
  priorityCount?: number;  /**
   * Control layered over each tile — the owner's edit pencil.
   *
   * A callback rather than a flag because the collection has no business
   * knowing what the control is. Called only where the caller supplies one, so
   * a visitor's page renders exactly what it did before.
   */
  renderOverlay?: (game: StoreProduct) => ReactNode;
  className?: string;
};

export function ProductGrid({
  games,
  locale,
  labels,
  layout = "grid",
  railLabel,
  priorityCount = 0,
  renderOverlay,
  className,
}: GameCollectionProps) {
  if (layout === "rail" && railLabel) {
    return (
      <Rail label={railLabel} itemWidth="sm" className={className}>
        {games.map((game, index) => (
          <RailItem key={game.id}>
            <ProductCard
              product={game}
              locale={locale}
              labels={labels}
              meta={priceTeaser(game, labels, locale)}
              priority={index < priorityCount}
              overlay={renderOverlay?.(game)}
            />
          </RailItem>
        ))}
      </Rail>
    );
  }

  return (
    <ul className={cn("grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5", className)}>
      {games.map((game, index) => (
        <li key={game.id}>
          <ProductCard
            product={game}
            locale={locale}
            labels={labels}
            meta={priceTeaser(game, labels, locale)}
            priority={index < priorityCount}
            overlay={renderOverlay?.(game)}
          />
        </li>
      ))}
    </ul>
  );
}
