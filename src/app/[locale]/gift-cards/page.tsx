import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { OfferGrid } from "@/components/store/offer-grid";
import { isLocale, type Locale } from "@/i18n/config";
import { getCommonMessages } from "@/i18n/messages";
import { CatalogReadError, getOffersByType } from "@/lib/services/catalog.service";
import { notFound } from "next/navigation";

type GiftCardsPageProps = { params: Promise<{ locale: string }> };

export default async function GiftCardsPage({ params }: GiftCardsPageProps) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) notFound();

  const locale = rawLocale as Locale;
  const messages = getCommonMessages(locale);
  let offers;

  try {
    offers = await getOffersByType(locale, "gift_card");
  } catch (error) {
    if (!(error instanceof CatalogReadError)) throw error;
    return <section className="mx-auto w-full max-w-7xl px-5 py-14 sm:px-8 sm:py-20"><ErrorState title={messages.giftCards.errorTitle} description={messages.giftCards.errorDescription} /></section>;
  }

  return (
    <section className="mx-auto w-full max-w-7xl px-5 py-14 sm:px-8 sm:py-20">
      <div className="max-w-2xl">
        <p className="text-sm font-medium text-[var(--accent)]">{messages.giftCards.eyebrow}</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-[var(--ink)] sm:text-6xl">{messages.giftCards.title}</h1>
        <p className="mt-4 text-base leading-7 text-[var(--ink-soft)]">{messages.giftCards.description}</p>
      </div>
      {offers.length === 0 ? <div className="mt-10"><EmptyState title={messages.giftCards.emptyTitle} description={messages.giftCards.emptyDescription} /></div> : <div className="mt-10"><OfferGrid offers={offers} locale={locale} /></div>}
    </section>
  );
}
