import Link from "next/link";
import { StoreImage } from "@/components/store/store-image";
import { Badge } from "@/components/ui/badge";
import { ArrowIcon, BoltIcon, CardIcon, TagIcon } from "@/components/ui/icons";
import { Price } from "@/components/ui/price";
import type { Locale } from "@/i18n/config";
import { formatMessage } from "@/i18n/messages";
import type { StoreOffer } from "@/lib/catalog/offer-mapper";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format/money";

/**
 * Offer tile.
 *
 * Two shapes for two contexts. Across games — a sale row, search results — the
 * card carries artwork and the game name, because the offer needs identifying.
 * Inside one game's page every offer would show the *same* picture and the same
 * type badge, so the compact shape drops both and leads with the denomination
 * and price, which is the only thing that differs.
 *
 * Links to the offer page when the parent game is known, and falls back to the
 * games index otherwise — an offer read without its game join has no canonical
 * URL of its own, and a dead link is worse than a broader one.
 */
export type OfferCardLabels = {
  sale: string;
  discount: string;
  /** The supplier's capital price, rendered only on an operator's cards. */
  capital: string;
  offerTypes: Record<StoreOffer["offerType"], string>;
};

export type OfferCardProps = {
  offer: StoreOffer;
  locale: Locale;
  labels: OfferCardLabels;
  /** Overrides the parent game from the offer, for a game-scoped list. */
  gameSlug?: string;
  showGameName?: boolean;
  /** Drops artwork and the type badge, for a list within a single game. */
  compact?: boolean;
  className?: string;
};

const TYPE_ICONS = {
  topup: BoltIcon,
  gift_card: CardIcon,
  redeem_code: TagIcon,
} as const;

/**
 * Capital price line for an operator's card.
 *
 * Rendered only when the server read enriched the offer — a visitor's offer
 * never carries `supplierCostUsd`, so nothing leaks.
 */
function CapitalPrice({ amount, locale, label }: { amount: number; locale: Locale; label: string }) {
  return (
    <span className="text-xs text-[var(--ink-muted)] tabular-nums">
      {label}: <span dir="ltr">{formatPrice(amount, "USD", locale)}</span>
    </span>
  );
}

export function OfferCard({
  offer,
  locale,
  labels,
  gameSlug,
  showGameName = true,
  compact = false,
  className,
}: OfferCardProps) {
  const slug = gameSlug ?? offer.game?.slug ?? null;
  const href = slug ? `/${locale}/games/${slug}/${offer.slug}` : `/${locale}/games`;
  const TypeIcon = TYPE_ICONS[offer.offerType];
  const discountLabel = offer.discountPercent
    ? formatMessage(labels.discount, { percent: offer.discountPercent }, locale)
    : undefined;

  const interactive =
    "transition-[transform,border-color,box-shadow] duration-[var(--duration)] ease-[var(--ease-spring)] hover:-translate-y-1 hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] hover:shadow-[var(--elevation-2)]";
  const capitalAmount = offer.supplierCostUsd ?? null;

  if (compact) {
    return (
      <Link
        href={href}
        prefetch={false}
        className={cn(
          "group flex h-full items-center justify-between gap-4 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--elevation-1)]",
          interactive,
          className,
        )}
      >
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <span className="line-clamp-2 text-[0.9375rem] leading-5 font-semibold text-[var(--ink)] sm:leading-6">
              {offer.name}
            </span>
            {offer.isSale ? <Badge tone="sale">{labels.sale}</Badge> : null}
          </span>
          <span className="mt-2 block">
            <Price
              amount={offer.price}
              currency={offer.currency}
              locale={locale}
              originalAmount={offer.originalPrice}
              discountPercent={offer.discountPercent}
              discountLabel={discountLabel}
              size="sm"
            />
          </span>
          {capitalAmount !== null ? (
            <span className="mt-1.5 block">
              <CapitalPrice amount={capitalAmount} locale={locale} label={labels.capital} />
            </span>
          ) : null}
        </span>

        <span
          className="grid size-9 shrink-0 place-items-center rounded-full border border-[var(--line)] text-[var(--ink-muted)] transition-[background-color,color] duration-[var(--duration)] group-hover:bg-[var(--accent)] group-hover:text-[var(--accent-ink)]"
          aria-hidden="true"
        >
          <ArrowIcon direction="end" className="size-4 rtl:rotate-180" />
        </span>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      prefetch={false}
      className={cn(
        "group flex h-full flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--elevation-1)]",
        interactive,
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
            <p className="line-clamp-2 text-xs leading-4 font-medium text-[var(--accent)]">
              {offer.game.name}
            </p>
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

        <div className="mt-auto">
          <div className="flex items-end justify-between gap-3">
            <Price
              amount={offer.price}
              currency={offer.currency}
              locale={locale}
              originalAmount={offer.originalPrice}
              discountPercent={offer.discountPercent}
              discountLabel={discountLabel}
            />
            <span
              className="grid size-8 shrink-0 place-items-center rounded-full border border-[var(--line)] text-[var(--ink-muted)] transition-[background-color,color] duration-[var(--duration)] group-hover:bg-[var(--accent)] group-hover:text-[var(--accent-ink)]"
              aria-hidden="true"
            >
              <ArrowIcon direction="end" className="size-3.5 rtl:rotate-180" />
            </span>
          </div>
          {capitalAmount !== null ? (
            <p className="mt-2">
              <CapitalPrice amount={capitalAmount} locale={locale} label={labels.capital} />
            </p>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
