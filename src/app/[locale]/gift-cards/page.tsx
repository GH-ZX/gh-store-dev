import type { Metadata } from "next";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { OfferGrid } from "@/components/store/collections";
import { Section, SectionHeader } from "@/components/ui/section";
import { formatMessage, getMessages } from "@/i18n/messages";
import { getOfferCardLabels } from "@/lib/catalog/labels";
import { resolveLocaleParam } from "@/lib/routing/locale-params";
import { buildPageMetadata } from "@/lib/seo";
import { getOffersByType, tryCatalogRead } from "@/lib/services/catalog.service";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/gift-cards">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const messages = getMessages(locale, "catalog");

  return buildPageMetadata({
    locale,
    path: "/gift-cards",
    title: messages.giftCards.title,
    description: messages.giftCards.description,
  });
}

export default async function GiftCardsPage({ params }: PageProps<"/[locale]/gift-cards">) {
  const locale = await resolveLocaleParam(params);
  const common = getMessages(locale, "common");
  const messages = getMessages(locale, "catalog");
  const result = await tryCatalogRead(() => getOffersByType(locale, "gift_card"));

  if (!result.ok) {
    return (
      <Section spacing="page">
        <ErrorState
          title={messages.giftCards.errorTitle}
          description={messages.giftCards.errorDescription}
          action={{ href: `/${locale}`, label: common.actions.browse }}
        />
      </Section>
    );
  }

  const offers = result.data;

  return (
    <Section spacing="page" mesh>
      <SectionHeader
        as="h1"
        eyebrow={messages.giftCards.eyebrow}
        title={messages.giftCards.title}
        subtitle={messages.giftCards.description}
      />

      {offers.length === 0 ? (
        <EmptyState
          className="mt-10"
          title={messages.giftCards.emptyTitle}
          description={messages.giftCards.emptyDescription}
        />
      ) : (
        <>
          <p className="mt-8 text-sm text-[var(--ink-muted)] tabular-nums">
            {formatMessage(messages.giftCards.count, { count: offers.length }, locale)}
          </p>
          <OfferGrid
            className="mt-4"
            offers={offers}
            locale={locale}
            labels={getOfferCardLabels(common, messages)}
          />
        </>
      )}
    </Section>
  );
}
