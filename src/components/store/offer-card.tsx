import Link from "next/link";
import { StoreImage } from "@/components/store/store-image";
import { Badge } from "@/components/ui/badge";
import { ArrowIcon, CardIcon, TagIcon, BoltIcon } from "@/components/ui/icons";
import { Price } from "@/components/ui/price";
import type { Locale } from "@/i18n/config";
import { formatMessage } from "@/i18n/messages";
import type { StoreOffer } from "@/lib/catalog/offer-mapper";
import { cn } from "@/lib/cn";

/**
 * Offer tile.
 *
 * Links to the offer page when the parent game is known, and falls back to the
 * game page otherwise — an offer read without its game join has no canonical URL
 * of its own, and a dead link is worse than a broader one.
 */
export type OfferCardLabels = {
  sale: string;
  discount: string;
  offerTypes: Record<StoreOffer["offerType"], string>;
};

export type OfferCardProps = {
  offer: StoreOffer;
  locale: Locale;
  labels: OfferCardLabels;
  /** Overrides the parent game from the offer, for a game-scoped list. */
  gameSlug?: string;
  showGameName?: boolean;
  className?: string;
};

const TYPE_ICONS = {
  topup: BoltIcon,
  gift_card: CardIcon,
  redeem_code: TagIcon,
} as const;

export function OfferCard({
  offer,
  locale,
  labels,
  gameSlug,
  showGameName = true,
  className,
}: OfferCardProps) {
  const slug = gameSlug ?? offer.game?.slug ?? null;
  const href = slug ? `/${locale}/games/${slug}/${offer.slug}` : `/${locale}/games`;
  const TypeIcon = TYPE_ICONS[offer.offerType];

  return (
    <Link
      href={href}
      className={cn(
        "group flex h-full flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--elevation-1)]",
        "transition-[transform,border-color,box-shadow] duration-[var(--duration)] ease-[var(--ease-spring)]",
        "hover:-translate-y-1 hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] hover:shadow-[var(--elevation-2)]",
        className,
      )}
    >
      <div className="relative aspect-[16/9] overflow-hidden border-b border-[var(--line)]">
        <StoreImage
          src={offer.imageUrl}
          alt=""
          sizes="(min-width: 1024px) 20rem, (min-width: 640px) 45vw, 80vw"
          className="transition-transform duration-[var(--duration-slow)] ease-[var(--ease-out-expo)] group-hover:scale-[1.05]"
        />
        <div className="absolute top-3 start-3 flex flex-wrap gap-1.5">
          <Badge tone="neutral" icon={<TypeIcon />} className="backdrop-blur-md">
            {labels.offerTypes[offer.offerType]}
          </Badge>
          {offer.isSale ? <Badge tone="sale">{labels.sale}</Badge> : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="min-w-0">
          {showGameName && offer.game ? (
            <p className="truncate text-xs font-medium text-[var(--accent)]">{offer.game.name}</p>
          ) : null}
          <h3 className="mt-1 line-clamp-2 text-[0.9375rem] leading-6 font-semibold text-[var(--ink)]">
            {offer.name}
          </h3>
          {offer.description ? (
            <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-[var(--ink-muted)]">
              {offer.description}
            </p>
          ) : null}
        </div>

        <div className="mt-auto flex items-end justify-between gap-3">
          <Price
            amount={offer.price}
            currency={offer.currency}
            locale={locale}
            originalAmount={offer.originalPrice}
            discountPercent={offer.discountPercent}
            discountLabel={
              offer.discountPercent
                ? formatMessage(labels.discount, { percent: offer.discountPercent }, locale)
                : undefined
            }
          />
          <span
            className="grid size-8 shrink-0 place-items-center rounded-full border border-[var(--line)] text-[var(--ink-muted)] transition-[background-color,color] duration-[var(--duration)] group-hover:bg-[var(--accent)] group-hover:text-[var(--accent-ink)]"
            aria-hidden="true"
          >
            <ArrowIcon direction="end" className="size-3.5 rtl:rotate-180" />
          </span>
        </div>
      </div>
    </Link>
  );
}
