import Link from "next/link";
import type { StoreOffer } from "@/lib/catalog/offer-mapper";

type OfferCardProps = {
  offer: StoreOffer;
  gameSlug: string;
  locale: string;
};

export function OfferCard({ offer, gameSlug, locale }: OfferCardProps) {
  const formatter = new Intl.NumberFormat(locale === "ar" ? "ar" : "en", {
    style: "currency",
    currency: offer.currency,
  });

  return (
    <Link
      href={`/${locale}/games/${gameSlug}/${offer.slug}`}
      className="group flex min-h-52 flex-col justify-between rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-5 transition-colors hover:border-[var(--accent)]"
    >
      <div>
        {offer.isSale ? <span className="text-xs font-semibold text-[var(--accent)]">Sale</span> : null}
        <h2 className="mt-2 text-lg font-semibold text-[var(--ink)]">{offer.name}</h2>
        {offer.description ? <p className="mt-2 line-clamp-3 text-sm leading-6 text-[var(--ink-muted)]">{offer.description}</p> : null}
      </div>
      <div className="mt-6 flex items-end justify-between gap-3">
        <span className="text-lg font-semibold text-[var(--ink)]">{formatter.format(offer.price)}</span>
        {offer.originalPrice ? <span className="text-sm text-[var(--ink-muted)] line-through">{formatter.format(offer.originalPrice)}</span> : null}
      </div>
    </Link>
  );
}
