import Link from "next/link";
import { GameEditor } from "@/components/live-edit/game-editor";
import { SectionEditor } from "@/components/live-edit/section-editor";
import { ReviewCard } from "@/components/store/review-card";
import { GameGrid, OfferGrid } from "@/components/store/collections";
import { ButtonLink } from "@/components/ui/button";
import { SocialIcon } from "@/components/ui/brand-icons";
import { ArrowIcon, BoltIcon, SupportIcon, WalletIcon } from "@/components/ui/icons";
import { Rail, RailItem } from "@/components/ui/rail";
import { Section, SectionHeader } from "@/components/ui/section";
import type { Locale } from "@/i18n/config";
import type { AdminMessages, CatalogMessages, CommonMessages, HomeMessages } from "@/i18n/messages";
import { getGameCardLabels, getOfferCardLabels } from "@/lib/catalog/labels";
import {
  getHomeSectionPagePath,
  getHomeSectionSubtitle,
  getHomeSectionTitle,
  type HomeSection,
} from "@/lib/home/layout";
import type { ResolvedHomeSection } from "@/lib/services/home.service";
import { getSocialLinkLabel, type SocialLink } from "@/lib/settings/public-settings";

/**
 * Homepage section renderer.
 *
 * The admin layout decides which sections exist, in what order, and with which
 * titles. This maps each resolved section to its presentation; it never fetches,
 * and it never decides whether a section belongs on the page.
 */
export type HomeSectionsProps = {
  locale: Locale;
  sections: ResolvedHomeSection[];
  common: CommonMessages;
  catalog: CatalogMessages;
  home: HomeMessages;
  socialLinks: SocialLink[];
  /**
   * Present only for an administrator, which is what turns the in-place editors
   * on. Passed as the messages rather than a boolean so a visitor's page never
   * carries dashboard copy it has no use for.
   */
  liveEdit?: AdminMessages["liveEdit"] | null;
};

/** Default subtitle per section type, used when an admin set no custom one. */
function fallbackSubtitle(section: HomeSection, home: HomeMessages): string | undefined {
  switch (section.type) {
    case "games":
    case "game_picks":
      return home.sections.gamesSubtitle;
    case "gift_cards":
      return home.sections.giftCardsSubtitle;
    case "sale_offers":
    case "offer_picks":
      return home.sections.saleSubtitle;
    case "suggested_offers":
      return home.sections.suggestedSubtitle;
    case "trending_offers":
      return home.sections.trendingSubtitle;
    case "customer_reviews":
      return home.sections.reviewsSubtitle;
    default:
      return undefined;
  }
}

/** Localized name of a payment rail the trust strip can claim. */
function paymentMethodLabel(method: string, home: HomeMessages): string {
  return (
    home.trust.paymentMethods[method as keyof typeof home.trust.paymentMethods] ?? method
  );
}

export function HomeSections({
  locale,
  sections,
  common,
  catalog,
  home,
  socialLinks,
  liveEdit,
}: HomeSectionsProps) {
  return (
    <>
      {sections.map((resolved) => {
        const { section } = resolved;
        const title = getHomeSectionTitle(section, locale);
        const customSubtitle = getHomeSectionSubtitle(section, locale);
        const subtitle = customSubtitle || fallbackSubtitle(section, home);
        const pagePath = getHomeSectionPagePath(section);

        const header = (
          <SectionHeader
            title={title}
            subtitle={subtitle}
            viewAllHref={pagePath ? `/${locale}${pagePath}` : undefined}
            viewAllLabel={pagePath ? common.actions.viewAll : undefined}
            actions={
              liveEdit ? (
                <SectionEditor
                  sectionId={section.id}
                  titleAr={section.titleAr}
                  titleEn={section.titleEn}
                  subtitleAr={section.subtitleAr}
                  subtitleEn={section.subtitleEn}
                  enabled={section.enabled}
                  limit={section.limit}
                  usesLimit={section.type !== "social_links"}
                  label={title}
                  messages={liveEdit}
                />
              ) : undefined
            }
          />
        );

        if (resolved.kind === "trust") {
          const trustItems = [
            {
              icon: <WalletIcon />,
              title: home.trust.items.payments.title,
              caption: home.trust.items.payments.caption,
              value: resolved.payments.map((method) => paymentMethodLabel(method, home)).join(" · "),
            },
            {
              icon: <BoltIcon />,
              title: home.trust.items.instant.title,
              caption: home.trust.items.instant.caption,
              value: null,
            },
            {
              icon: <SupportIcon />,
              title: home.trust.items.support.title,
              caption: home.trust.items.support.caption,
              value: null,
            },
          ];

          return (
            <Section key={section.id} spacing="normal">
              {header}
              <ul className="mt-8 grid gap-3 sm:grid-cols-3">
                {trustItems.map((item) => (
                  <li
                    key={item.title}
                    className="flex items-start gap-4 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-5"
                  >
                    <span className="grid size-11 shrink-0 place-items-center rounded-full border border-[var(--line)] bg-[var(--shell)] text-[var(--accent)] [&>svg]:size-5">
                      {item.icon}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-[var(--ink)]">{item.title}</span>
                      <span className="mt-1 block text-xs leading-5 text-[var(--ink-muted)]">
                        {item.caption}
                      </span>
                      {item.value ? (
                        <span
                          className="mt-2 block truncate text-xs font-medium text-[var(--accent-strong)]"
                          title={item.value}
                        >
                          {item.value}
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          );
        }

        if (resolved.kind === "how") {
          return (
            <Section key={section.id} spacing="normal">
              {header}
              <ol className="mt-8 grid gap-3 sm:grid-cols-3">
                {home.howMini.steps.map((step, index) => (
                  <li
                    key={step.title}
                    className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-5"
                  >
                    <span className="grid size-9 place-items-center rounded-full bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-sm font-bold text-[var(--accent-strong)] tabular-nums">
                      {index + 1}
                    </span>
                    <p className="mt-3 text-sm font-semibold text-[var(--ink)]">{step.title}</p>
                    <p className="mt-1.5 text-xs leading-5 text-[var(--ink-muted)]">{step.body}</p>
                  </li>
                ))}
              </ol>
            </Section>
          );
        }

        if (resolved.kind === "games") {
          return (
            <Section key={section.id} spacing="normal">
              {header}
              <GameGrid
                className="mt-8"
                games={resolved.games}
                locale={locale}
                labels={getGameCardLabels(common)}
                renderOverlay={
                  liveEdit
                    ? (game) => (
                        <GameEditor
                          gameId={game.id}
                          gameSlug={game.slug}
                          label={game.name}
                          locale={locale}
                          messages={liveEdit}
                        />
                      )
                    : undefined
                }
              />
            </Section>
          );
        }

        if (resolved.kind === "offers") {
          return (
            <Section key={section.id} spacing="normal">
              {header}
              <OfferGrid
                className="mt-8"
                offers={resolved.offers}
                locale={locale}
                labels={getOfferCardLabels(common, catalog)}
                layout="rail"
                railLabel={title}
              />
            </Section>
          );
        }

        if (resolved.kind === "reviews") {
          return (
            <Section key={section.id} spacing="normal">
              {header}
              <Rail label={title} itemWidth="md" className="mt-8">
                {resolved.reviews.map((review) => (
                  <RailItem key={review.id}>
                    <ReviewCard
                      review={review}
                      locale={locale}
                      labels={{
                        ratingLabel: home.reviews.ratingLabel,
                        verified: home.reviews.verified,
                      }}
                    />
                  </RailItem>
                ))}
              </Rail>
            </Section>
          );
        }

        if (socialLinks.length === 0) {
          return null;
        }

        return (
          <Section key={section.id} spacing="normal">
            <div className="relative overflow-hidden rounded-[var(--radius-shell)] border border-[var(--line)] bg-[var(--shell)] p-8 sm:p-12">
              <div className="gh-mesh" aria-hidden="true" />
              <div className="relative flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="max-w-lg">
                  <div className="flex items-center gap-3">
                    <h2 className="text-[clamp(1.5rem,3.4vw,2.25rem)] leading-[1.15] font-semibold tracking-[-0.03em] text-[var(--ink)]">
                      {title}
                    </h2>
                    {liveEdit ? (
                      <SectionEditor
                        sectionId={section.id}
                        titleAr={section.titleAr}
                        titleEn={section.titleEn}
                        subtitleAr={section.subtitleAr}
                        subtitleEn={section.subtitleEn}
                        enabled={section.enabled}
                        limit={section.limit}
                        usesLimit={false}
                        label={title}
                        messages={liveEdit}
                      />
                    ) : null}
                  </div>
                  {subtitle ? (
                    <p className="mt-3 text-base leading-7 text-[var(--ink-soft)]">{subtitle}</p>
                  ) : null}

                  <ul className="mt-6 flex flex-wrap gap-2">
                    {socialLinks.slice(0, 6).map((link) => (
                      <li key={link.id}>
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="group inline-flex min-h-10 items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--line)] bg-[var(--surface)] px-4 text-sm text-[var(--ink-soft)] transition-colors duration-[var(--duration)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
                        >
                          <SocialIcon
                            platform={link.platform}
                            className="size-4 shrink-0 text-[var(--ink-faint)] transition-colors duration-[var(--duration)] group-hover:text-[var(--accent)]"
                          />
                          {getSocialLinkLabel(link, locale)}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>

                <ButtonLink
                  href={`/${locale}/links`}
                  variant="secondary"
                  size="lg"
                  trailingIcon={<ArrowIcon direction="end" className="rtl:rotate-180" />}
                >
                  {home.social.buttonLabel}
                </ButtonLink>
              </div>
            </div>
          </Section>
        );
      })}
    </>
  );
}

/**
 * Shown when the layout resolves to nothing renderable — an empty catalog, or
 * every section disabled.
 *
 * Presented as a deliberate panel rather than a loose row of pills, so a store
 * that is still being filled does not look broken to a visitor.
 */
export function HomeFallbackLinks({ locale, common }: { locale: Locale; common: CommonMessages }) {
  const links = [
    { href: `/${locale}/games`, label: common.navigation.games },
    { href: `/${locale}/gift-cards`, label: common.navigation.giftCards },
    { href: `/${locale}/sale`, label: common.links.sale },
    { href: `/${locale}/how`, label: common.links.how },
  ];

  return (
    <div className="rounded-[var(--radius-shell)] border border-[var(--line)] bg-[var(--shell)] p-8 text-center sm:p-12">
      <h2 className="text-[clamp(1.25rem,2.6vw,1.75rem)] leading-[1.2] font-semibold tracking-[-0.02em] text-[var(--ink)]">
        {common.states.emptyTitle}
      </h2>
      <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[var(--ink-muted)]">
        {common.states.emptyDescription}
      </p>

      <ul className="mt-7 flex flex-wrap justify-center gap-2">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="inline-flex min-h-11 items-center rounded-[var(--radius-pill)] border border-[var(--line)] bg-[var(--surface)] px-5 text-sm font-medium text-[var(--ink-soft)] transition-colors duration-[var(--duration)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] hover:text-[var(--ink)]"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
