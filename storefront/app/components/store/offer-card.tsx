import { Link } from "react-router";
import { StoreImage } from "@/components/store/store-image";
import { ArrowIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";
import { formatMessage, getMessages } from "@/i18n/messages";
import type { StoreOffer } from "@/lib/catalog/offer-mapper";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format/money";
import { getOfferArtwork } from "@/lib/catalog/presentation";
import { offerPath, UNCATEGORIZED_PRODUCT_PATH } from "@/lib/catalog/paths";

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
  const presentation = getMessages(locale, "presentation");
  const artwork = getOfferArtwork(offer);
  const slug = gameSlug ?? offer.game?.slug ?? null;
  const categorySlug = offer.game?.categorySlug ?? UNCATEGORIZED_PRODUCT_PATH;
  const href = slug ? offerPath(locale, { slug, categorySlug }, offer) : `/${locale}/products`;
  const hasOriginal = typeof offer.originalPrice === "number" && offer.originalPrice > offer.price;
  const discountLabel = hasOriginal && offer.discountPercent && offer.discountPercent > 0
    ? formatMessage(labels.discount, { percent: offer.discountPercent }, locale)
    : null;

  return (
    <Link to={href} prefetch="intent" className={cn("sf-offer-card", compact && "sf-offer-card-compact", className)}>
      {!compact ? (
        <div className="sf-offer-art" data-artwork-fit={artwork.fit}>
          <StoreImage {...artwork} alt="" fallbackLabel={offer.game?.name || offer.name} category={offer.game?.categorySlug} fallbackText={presentation.imageUnavailable} width={224} height={224} sizes="(min-width: 640px) 112px, 88px" />
        </div>
      ) : null}
      <div className="sf-offer-copy">
        {!compact && showGameName && offer.game ? (
          <p className="sf-offer-product"><bdi>{offer.game.name}</bdi></p>
        ) : null}
        <h3 className="sf-offer-title"><bdi>{offer.name}</bdi></h3>
        {!compact ? <div className="sf-offer-meta"><span className="sf-offer-type">{labels.offerTypes[offer.offerType]}</span>{offer.regionCode ? <span className="sf-offer-region">{presentation.regionLabel}: <bdi dir="ltr">{offer.regionCode}</bdi></span> : null}</div> : null}
        {offer.supplierCostUsd != null ? (
          <p className="sf-offer-capital">
            {labels.capital}: <bdi dir="ltr">{formatPrice(offer.supplierCostUsd, "USD", locale)}</bdi>
          </p>
        ) : null}
      </div>
      <div className="sf-offer-card-footer">
        <div className="sf-offer-pricing">
          <bdi dir="ltr" className="sf-offer-amount">{formatPrice(offer.price, offer.currency, locale)}</bdi>
          {hasOriginal ? <s className="sf-offer-original"><bdi dir="ltr">{formatPrice(offer.originalPrice!, offer.currency, locale)}</bdi></s> : null}
          {discountLabel || offer.isSale ? <span className="sf-offer-discount">{discountLabel || labels.sale}</span> : null}
        </div>
        <span className="sf-offer-cta">{presentation.viewOffer}<ArrowIcon direction="end" className="sf-offer-arrow size-4 rtl:rotate-180" /></span>
      </div>
    </Link>
  );
}
