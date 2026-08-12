import { notFound } from "next/navigation";
import { EmptyState } from "@/components/shared/empty-state";
import { OfferCard } from "@/components/store/offer-card";
import { isLocale, type Locale } from "@/i18n/config";
import { getCommonMessages } from "@/i18n/messages";
import { getGameBySlug } from "@/lib/services/catalog.service";

type GameDetailPageProps = {
  params: Promise<{ locale: string; slug: string }>;
};

export default async function GameDetailPage({ params }: GameDetailPageProps) {
  const { locale: rawLocale, slug } = await params;

  if (!isLocale(rawLocale)) {
    notFound();
  }

  const locale = rawLocale as Locale;
  const messages = getCommonMessages(locale);
  const detail = await getGameBySlug(locale, slug);

  if (!detail) {
    notFound();
  }

  return (
    <section className="mx-auto w-full max-w-7xl px-5 py-14 sm:px-8 sm:py-20">
      <div className="grid gap-8 border-b border-[var(--line)] pb-10 lg:grid-cols-[1fr_0.72fr] lg:items-end">
        <div>
          {detail.game.pointsName ? <p className="text-sm font-medium text-[var(--accent)]">{detail.game.pointsName}</p> : null}
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-[var(--ink)] sm:text-6xl">{detail.game.name}</h1>
          {detail.game.description ? <p className="mt-5 max-w-2xl text-base leading-7 text-[var(--ink-soft)]">{detail.game.description}</p> : null}
        </div>
        <p className="text-sm leading-6 text-[var(--ink-muted)]">{messages.gameDetail.chooseOffer}</p>
      </div>

      {detail.offers.length === 0 ? (
        <div className="mt-10"><EmptyState title={messages.gameDetail.emptyTitle} description={messages.gameDetail.emptyDescription} /></div>
      ) : (
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {detail.offers.map((offer) => (
            <OfferCard key={offer.id} offer={offer} gameSlug={detail.game.slug} locale={locale} />
          ))}
        </div>
      )}
    </section>
  );
}
