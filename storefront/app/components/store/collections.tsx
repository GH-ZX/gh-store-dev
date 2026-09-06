import "@/styles/storefront-cards.css";
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
 * The tile's teaser price, when the read enriched the product with one.
 * A product without active offers renders no line rather than a fake number.
 */
function priceTeaser(
  product: StoreProduct,
  labels: { from?: string },
  locale: Locale,
): { label: string; price: string } | undefined {
  if (typeof product.priceFrom !== "number" || !labels.from) {
    return undefined;
  }

  return {
    label: labels.from,
    price: formatPrice(product.priceFrom, "USD", locale),
  };
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
  /** Compact rows without artwork, for a list inside a single product. */
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
      <Rail label={railLabel} itemWidth="md" className={cn("sf-offer-rail", className)}>
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
    <ul className={cn("sf-offer-grid", compact && "sf-offer-grid-compact", className)}>
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

export type ProductCollectionProps = {
  games: StoreProduct[];
  locale: Locale;
  labels: { featured: string; from?: string };
  layout?: CollectionLayout;
  railLabel?: string;
  /** How many leading tiles load eagerly, for above-the-fold rows. */
  priorityCount?: number;
  /**
   * Control layered over each tile — the owner's edit pencil.
   *
   * A callback rather than a flag because the collection has no business
   * knowing what the control is. Called only where the caller supplies one, so
   * a visitor's page renders exactly what it did before.
   */
  renderOverlay?: (product: StoreProduct) => ReactNode;
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
}: ProductCollectionProps) {
  if (layout === "rail" && railLabel) {
    return (
      <Rail label={railLabel} itemWidth="sm" className={cn("sf-product-rail", className)}>
        {games.map((product, index) => (
          <RailItem key={product.id}>
            <ProductCard
              product={product}
              locale={locale}
              labels={labels}
              meta={priceTeaser(product, labels, locale)}
              priority={index < priorityCount}
              overlay={renderOverlay?.(product)}
            />
          </RailItem>
        ))}
      </Rail>
    );
  }

  return (
    <ul className={cn("sf-product-grid", className)}>
      {games.map((product, index) => (
        <li key={product.id}>
          <ProductCard
            product={product}
            locale={locale}
            labels={labels}
            meta={priceTeaser(product, labels, locale)}
            priority={index < priorityCount}
            overlay={renderOverlay?.(product)}
          />
        </li>
      ))}
    </ul>
  );
}
