import { Link } from "react-router";
import { StoreImage } from "@/components/store/store-image";
import { ArrowIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";
import { formatMessage } from "@/i18n/messages";
import type { StoreOffer } from "@/lib/catalog/offer-mapper";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format/money";

export type OfferCardLabels = {
  sale: string;
  discount: string;
  /** Supplier cost is present only on server-enriched operator cards. */
  capital: string;
  offerTypes: Record<StoreOffer["offerType"], string>;
};

export type OfferCardProps = {
  offer: StoreOffer;
  locale: Locale;
  labels: OfferCardLabels;
  /** Compatibility with existing product-scoped callers. */
  gameSlug?: string;
  showGameName?: boolean;
  /** Product-scoped offers omit repeated artwork, type and description. */
  compact?: boolean;
  className?: string;
};

export function OfferCard({ offer, locale, labels, gameSlug, showGameName = true, compact = false, className }: OfferCardProps) {
  const slug = gameSlug ?? offer.game?.slug ?? null;
  const categorySlug = offer.game?.categorySlug ?? "games";
  const href = slug ? `/${locale}/${categorySlug}/${slug}/${offer.slug}` : `/${locale}/products`;
  const hasOriginal = typeof offer.originalPrice === "number" && offer.originalPrice > offer.price;
  const discountLabel = hasOriginal && offer.discountPercent && offer.discountPercent > 0
    ? formatMessage(labels.discount, { percent: offer.discountPercent }, locale)
    : null;

  return (
    <Link to={href} prefetch="intent" className={cn("sf-offer-card", compact && "sf-offer-card-compact", className)}>
      {!compact ? (
        <div className="sf-offer-art">
          <StoreImage src={offer.imageUrl} alt="" sizes="64px" />
        </div>
      ) : null}
      <div className="sf-offer-copy">
        {!compact && showGameName && offer.game ? (
          <p className="sf-offer-product"><bdi>{offer.game.name}</bdi></p>
        ) : null}
        <h3 className="sf-offer-title"><bdi>{offer.name}</bdi></h3>
        {!compact ? <p className="sf-offer-type">{labels.offerTypes[offer.offerType]}</p> : null}
        {offer.isSale ? <span className="sf-offer-sale">{labels.sale}</span> : null}
        {offer.supplierCostUsd != null ? (
          <p className="sf-offer-capital">
            {labels.capital}: <bdi dir="ltr">{formatPrice(offer.supplierCostUsd, "USD", locale)}</bdi>
          </p>
        ) : null}
      </div>
      <div className="sf-offer-pricing">
        <bdi dir="ltr" className="sf-offer-amount">{formatPrice(offer.price, offer.currency, locale)}</bdi>
        {hasOriginal ? <s className="sf-offer-original"><bdi dir="ltr">{formatPrice(offer.originalPrice!, offer.currency, locale)}</bdi></s> : null}
        {discountLabel ? <span className="sf-offer-discount">{discountLabel}</span> : null}
      </div>
      <span className="sf-offer-arrow" aria-hidden="true"><ArrowIcon direction={locale === "ar" ? "start" : "end"} className="size-4" /></span>
    </Link>
  );
}
