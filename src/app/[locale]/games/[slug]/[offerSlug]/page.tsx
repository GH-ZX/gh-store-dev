import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NoticePanel } from "@/components/shared/states";
import { OfferGrid } from "@/components/store/collections";
import { StoreImage } from "@/components/store/store-image";
import { Badge, Eyebrow } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckIcon, ChevronIcon, ShieldIcon } from "@/components/ui/icons";
import { Price } from "@/components/ui/price";
import { Section, SectionHeader } from "@/components/ui/section";
import { formatMessage, getMessages } from "@/i18n/messages";
import { getOfferCardLabels } from "@/lib/catalog/labels";
import { resolveLocaleParam } from "@/lib/routing/locale-params";
import { buildPageMetadata } from "@/lib/seo";
import { getOfferBySlug, type StoreInputField } from "@/lib/services/catalog.service";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/games/[slug]/[offerSlug]">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const { slug, offerSlug } = await params;
  const detail = await getOfferBySlug(locale, slug, offerSlug);

  if (!detail) {
    return {};
  }

  const messages = getMessages(locale, "catalog");

  return buildPageMetadata({
    locale,
    path: `/games/${slug}/${offerSlug}`,
    title: `${detail.offer.name} · ${detail.game.name}`,
    description: detail.offer.description ?? messages.offerDetail.fieldsDescription,
    imageUrl: detail.offer.imageUrl,
  });
}

/** One required account field, shown read-only until checkout exists. */
function FieldPreview({ field, labels }: { field: StoreInputField; labels: { required: string; optional: string } }) {
  return (
    <li className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-[var(--ink)]">{field.label}</span>
        <Badge tone={field.isRequired ? "accent" : "neutral"}>
          {field.isRequired ? labels.required : labels.optional}
        </Badge>
      </div>
      {field.placeholder ? (
        <p className="mt-2 text-xs text-[var(--ink-muted)]">{field.placeholder}</p>
      ) : null}
      {field.options.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {field.options.slice(0, 6).map((option) => (
            <li key={option.value}>
              <Badge tone="neutral">{option.label}</Badge>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export default async function OfferDetailPage({
  params,
}: PageProps<"/[locale]/games/[slug]/[offerSlug]">) {
  const locale = await resolveLocaleParam(params);
  const { slug, offerSlug } = await params;
  const common = getMessages(locale, "common");
  const messages = getMessages(locale, "catalog");
  const detail = await getOfferBySlug(locale, slug, offerSlug);

  if (!detail) {
    notFound();
  }

  const { offer, game, inputFields, relatedOffers } = detail;

  return (
    <>
      <Section spacing="page" mesh>
        <nav aria-label={game.name}>
          <Link
            href={`/${locale}/games/${game.slug}`}
            className="inline-flex min-h-9 items-center gap-1.5 text-sm text-[var(--ink-muted)] transition-colors duration-[var(--duration)] hover:text-[var(--ink)]"
          >
            <ChevronIcon direction="start" className="size-4 rtl:rotate-180" />
            {game.name}
          </Link>
        </nav>

        <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
          <div>
            <Eyebrow className="mb-4">{messages.offerDetail.eyebrow}</Eyebrow>
            <h1 className="text-[clamp(1.875rem,4.5vw,3rem)] leading-[1.08] font-semibold tracking-[-0.03em] text-[var(--ink)]">
              {offer.name}
            </h1>
            {offer.description ? (
              <p className="mt-5 max-w-2xl text-base leading-7 text-[var(--ink-soft)]">
                {offer.description}
              </p>
            ) : null}

            <dl className="mt-8 grid gap-3 sm:grid-cols-3">
              <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--shell)] p-4">
                <dt className="text-xs font-medium text-[var(--ink-faint)]">
                  {messages.offerDetail.typeLabel}
                </dt>
                <dd className="mt-1 text-sm font-semibold text-[var(--ink)]">
                  {messages.offerTypes[offer.offerType]}
                </dd>
              </div>
              {offer.regionCode ? (
                <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--shell)] p-4">
                  <dt className="text-xs font-medium text-[var(--ink-faint)]">
                    {messages.offerDetail.regionLabel}
                  </dt>
                  <dd className="mt-1 text-sm font-semibold text-[var(--ink)]">{offer.regionCode}</dd>
                </div>
              ) : null}
              <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--shell)] p-4">
                <dt className="text-xs font-medium text-[var(--ink-faint)]">
                  {messages.offerDetail.priceLabel}
                </dt>
                <dd className="mt-1">
                  <Price
                    amount={offer.price}
                    currency={offer.currency}
                    locale={locale}
                    originalAmount={offer.originalPrice}
                    size="sm"
                  />
                </dd>
              </div>
            </dl>
          </div>

          {/* Order summary rail. The purchase action lands with checkout. */}
          <aside className="lg:sticky lg:top-28 lg:self-start">
            <div className="rounded-[var(--radius-shell)] border border-[var(--line)] bg-[var(--shell)] p-1.5 backdrop-blur-xl">
              <div className="gh-sheen overflow-hidden rounded-[var(--radius-inner)] border border-[var(--line)] bg-[var(--surface)]">
                <div className="relative aspect-[16/9] border-b border-[var(--line)]">
                  <StoreImage
                    src={offer.imageUrl}
                    alt={offer.name}
                    priority
                    sizes="(min-width: 1024px) 24rem, 92vw"
                  />
                  {offer.isSale ? (
                    <div className="absolute top-3 start-3">
                      <Badge tone="sale">{common.badges.sale}</Badge>
                    </div>
                  ) : null}
                </div>

                <div className="grid gap-4 p-5">
                  <h2 className="text-sm font-semibold text-[var(--ink)]">
                    {messages.offerDetail.summaryHeading}
                  </h2>

                  <Price
                    amount={offer.price}
                    currency={offer.currency}
                    locale={locale}
                    originalAmount={offer.originalPrice}
                    discountPercent={offer.discountPercent}
                    discountLabel={
                      offer.discountPercent
                        ? formatMessage(common.price.discount, { percent: offer.discountPercent }, locale)
                        : undefined
                    }
                    size="lg"
                  />

                  <Button disabled aria-disabled="true" fullWidth size="lg">
                    {common.actions.buyNow}
                  </Button>

                  <p className="flex items-start gap-2 text-xs leading-5 text-[var(--ink-muted)]">
                    <ShieldIcon className="mt-0.5 size-4 shrink-0 text-[var(--accent)]" />
                    {messages.offerDetail.checkoutSoonDescription}
                  </p>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </Section>

      <Section spacing="tight">
        <SectionHeader
          title={inputFields.length > 0 ? messages.offerDetail.fieldsHeading : messages.offerDetail.noFieldsTitle}
          subtitle={
            inputFields.length > 0
              ? messages.offerDetail.fieldsDescription
              : messages.offerDetail.noFieldsDescription
          }
        />

        {inputFields.length > 0 ? (
          <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {inputFields.map((field) => (
              <FieldPreview
                key={field.id}
                field={field}
                labels={{
                  required: messages.offerDetail.requiredField,
                  optional: messages.offerDetail.optionalField,
                }}
              />
            ))}
          </ul>
        ) : (
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {messages.gameDetail.howItWorksSteps.slice(2).map((step) => (
              <li
                key={step}
                className="flex items-start gap-3 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-4 text-sm leading-6 text-[var(--ink-soft)]"
              >
                <CheckIcon className="mt-0.5 size-4 shrink-0 text-[var(--success)]" />
                {step}
              </li>
            ))}
          </ul>
        )}

        <NoticePanel
          className="mt-6"
          title={messages.offerDetail.checkoutSoonTitle}
          description={messages.offerDetail.checkoutSoonDescription}
        />
      </Section>

      {relatedOffers.length > 0 ? (
        <Section spacing="normal">
          <SectionHeader
            title={messages.offerDetail.relatedHeading}
            viewAllHref={`/${locale}/games/${game.slug}`}
            viewAllLabel={common.actions.viewAll}
          />
          <OfferGrid
            className="mt-8"
            offers={relatedOffers}
            locale={locale}
            labels={getOfferCardLabels(common, messages)}
            gameSlug={game.slug}
            showGameName={false}
          />
        </Section>
      ) : null}
    </>
  );
}
