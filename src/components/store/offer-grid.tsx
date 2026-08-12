import type { StoreOffer } from "@/lib/catalog/offer-mapper";
import { OfferCard } from "@/components/store/offer-card";

type OfferGridProps = {
  offers: StoreOffer[];
  locale: string;
};

export function OfferGrid({ offers, locale }: OfferGridProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {offers.map((offer) => <OfferCard key={offer.id} offer={offer} locale={locale} />)}
    </div>
  );
}
