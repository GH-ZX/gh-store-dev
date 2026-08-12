import type { Metadata } from "next";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { OfferGrid } from "@/components/store/collections";
import { Section, SectionHeader } from "@/components/ui/section";
import { formatMessage, getMessages } from "@/i18n/messages";
import { getOfferCardLabels } from "@/lib/catalog/labels";
import { resolveLocaleParam } from "@/lib/routing/locale-params";
import { buildPageMetadata } from "@/lib/seo";
import { getSaleOffers, tryCatalogRead } from "@/lib/services/catalog.service";

export async function generateMetadata({ params }: PageProps<"/[locale]/sale">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const messages = getMessages(locale, "catalog");

  return buildPageMetadata({
    locale,
    path: "/sale",
    title: messages.sale.title,
    description: messages.sale.description,
  });
}

export default async function SalePage({ params }: PageProps<"/[locale]/sale">) {
  const locale = await resolveLocaleParam(params);
  const common = getMessages(locale, "common");
  const messages = getMessages(locale, "catalog");
  const result = await tryCatalogRead(() => getSaleOffers(locale));

  if (!result.ok) {
    return (
      <Section spacing="page">
        <ErrorState
          title={messages.sale.errorTitle}
          description={messages.sale.errorDescription}
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
        eyebrow={messages.sale.eyebrow}
        title={messages.sale.title}
        subtitle={messages.sale.description}
      />

      {offers.length === 0 ? (
        <EmptyState
          className="mt-10"
          title={messages.sale.emptyTitle}
          description={messages.sale.emptyDescription}
          action={{ href: `/${locale}/games`, label: common.navigation.games }}
        />
      ) : (
        <>
          <p className="mt-8 text-sm text-[var(--ink-muted)] tabular-nums">
            {formatMessage(messages.sale.count, { count: offers.length }, locale)}
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
