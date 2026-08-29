import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/shared/states";
import { DescriptionText } from "@/components/store/description-text";
import { OfferGrid } from "@/components/store/collections";
import { StoreImage } from "@/components/store/store-image";
import { Badge, Eyebrow } from "@/components/ui/badge";
import { ChevronIcon } from "@/components/ui/icons";
import { Section, SectionHeader } from "@/components/ui/section";
import { getMessages } from "@/i18n/messages";
import { getOfferCardLabels } from "@/lib/catalog/labels";
import { formatPrice, lowestPrice } from "@/lib/format/money";
import { resolveLocaleParam } from "@/lib/routing/locale-params";
import { buildPageMetadata } from "@/lib/seo";
import { getProductBySlug } from "@/lib/services/catalog.service";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/[category]/[slug]">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const { slug } = await params;
  const detail = await getProductBySlug(locale, slug);

  if (!detail) {
    return {};
  }

  const messages = getMessages(locale, "catalog");

  return buildPageMetadata({
    locale,
    path: `/${detail.game.categorySlug}/${slug}`,
    title: detail.game.name,
    description: detail.game.description ?? messages.gameDetail.chooseOffer,
    imageUrl: detail.game.imageUrl,
  });
}

export default async function ProductDetailPage({ params }: PageProps<"/[locale]/[category]/[slug]">) {
  const locale = await resolveLocaleParam(params);
  const { slug } = await params;
  const common = getMessages(locale, "common");
  const messages = getMessages(locale, "catalog");
  const detail = await getProductBySlug(locale, slug);

  if (!detail) {
    notFound();
  }

  const { game, offers } = detail;
  const cheapest = lowestPrice(offers);

  return (
    <>
      <Section spacing="page" mesh>
        <nav aria-label={messages.gameDetail.backToGames}>
          <Link
            href={`/${locale}/games`}
            className="inline-flex min-h-9 items-center gap-1.5 text-sm text-[var(--ink-muted)] transition-colors duration-[var(--duration)] hover:text-[var(--ink)]"
          >
            <ChevronIcon direction="start" className="size-4 rtl:rotate-180" />
            {messages.gameDetail.backToGames}
          </Link>
        </nav>

        <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_minmax(0,26rem)] lg:items-center">
          <div>
            {game.pointsName ? <Eyebrow className="mb-4">{game.pointsName}</Eyebrow> : null}
            <h1 className="text-[clamp(2.25rem,6vw,3.75rem)] leading-[1.05] font-semibold tracking-[-0.035em] text-[var(--ink)]">
              {game.name}
            </h1>
            {game.description ? (
              <DescriptionText text={game.description} className="mt-5" />
            ) : null}

            <div className="mt-6 flex flex-wrap items-center gap-2">
              {game.isFeatured ? <Badge tone="accent">{common.badges.featured}</Badge> : null}
              {cheapest ? (
                <Badge tone="neutral">
                  {common.price.from} {formatPrice(cheapest.price, cheapest.currency, locale)}
                </Badge>
              ) : null}
            </div>

            <p className="mt-6 max-w-xl text-sm leading-6 text-[var(--ink-muted)]">
              {messages.gameDetail.chooseOffer}
            </p>
          </div>

          <div className="rounded-[var(--radius-shell)] border border-[var(--line)] bg-[var(--shell)] p-1.5 backdrop-blur-xl">
            <div className="gh-sheen relative aspect-[4/3] overflow-hidden rounded-[var(--radius-inner)] border border-[var(--line)]">
              <StoreImage
                src={game.imageUrl}
                alt={game.name}
                priority
                focus={game.carouselFocus}
                sizes="(min-width: 1024px) 26rem, 92vw"
              />
              {game.logoUrl ? (
                <span className="absolute bottom-3 start-3 grid size-14 overflow-hidden rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)]">
                  <StoreImage src={game.logoUrl} alt="" sizes="3.5rem" />
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </Section>

      <Section spacing="tight">
        <SectionHeader title={messages.gameDetail.offersHeading} />

        {offers.length === 0 ? (
          <EmptyState
            className="mt-8"
            title={messages.gameDetail.emptyTitle}
            description={messages.gameDetail.emptyDescription}
            action={{ href: `/${locale}/games`, label: messages.gameDetail.backToGames }}
          />
        ) : (
          <OfferGrid
            className="mt-8"
            offers={offers}
            locale={locale}
            labels={getOfferCardLabels(common, messages)}
            gameSlug={game.slug}
            showGameName={false}
            compact
          />
        )}
      </Section>

      <Section spacing="normal">
        <div className="rounded-[var(--radius-shell)] border border-[var(--line)] bg-[var(--shell)] p-6 sm:p-8">
          <h2 className="text-lg font-semibold text-[var(--ink)]">
            {messages.gameDetail.howItWorksHeading}
          </h2>
          <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {messages.gameDetail.howItWorksSteps.map((step, index) => (
              <li
                key={step}
                className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-4"
              >
                <span className="grid size-8 place-items-center rounded-full border border-[var(--line-strong)] text-xs font-bold text-[var(--accent)] tabular-nums">
                  {index + 1}
                </span>
                <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">{step}</p>
              </li>
            ))}
          </ol>
        </div>
      </Section>
    </>
  );
}
