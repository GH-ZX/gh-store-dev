import { HeroCarousel } from "@/components/home/hero-carousel";
import { Bezel } from "@/components/ui/card";
import { Eyebrow } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { ArrowIcon, BoltIcon, GamepadIcon, ShieldIcon, SparkIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";
import type { CommonMessages, HomeMessages } from "@/i18n/messages";
import type { StoreGame } from "@/lib/catalog/game-mapper";

/**
 * Homepage hero.
 *
 * Asymmetric split: the pitch and calls to action on one side, the featured
 * carousel on the other. When no carousel game is configured the artwork column
 * falls back to a value panel, so the hero never collapses to a bare column of
 * text on a fresh store.
 */
export type HomeHeroProps = {
  locale: Locale;
  common: CommonMessages;
  messages: HomeMessages;
  carouselGames: StoreGame[];
  carouselIntervalSeconds: number;
};

export function HomeHero({
  locale,
  common,
  messages,
  carouselGames,
  carouselIntervalSeconds,
}: HomeHeroProps) {
  const stats = [
    {
      icon: <BoltIcon />,
      label: messages.hero.statsDelivery,
      value: messages.hero.statsDeliveryValue,
    },
    {
      icon: <GamepadIcon />,
      label: messages.hero.statsCatalog,
      value: messages.hero.statsCatalogValue,
    },
    {
      icon: <ShieldIcon />,
      label: messages.hero.statsSupport,
      value: messages.hero.statsSupportValue,
    },
  ];

  return (
    <div className="grid gap-10 lg:grid-cols-[1.15fr_minmax(0,0.85fr)] lg:items-center lg:gap-14">
      <div className="gh-rise">
        <Eyebrow icon={<SparkIcon />}>{messages.hero.eyebrow}</Eyebrow>

        <h1 className="mt-5 text-[clamp(2.5rem,7vw,4.5rem)] leading-[1.02] font-semibold tracking-[-0.04em] text-[var(--ink)]">
          {messages.hero.title}
        </h1>

        <p className="mt-6 max-w-xl text-base leading-7 text-[var(--ink-soft)] sm:text-lg sm:leading-8">
          {messages.hero.description}
        </p>

        <div className="mt-9 flex flex-wrap items-center gap-3">
          <ButtonLink
            href={`/${locale}/games`}
            size="lg"
            trailingIcon={<ArrowIcon direction="end" className="rtl:rotate-180" />}
          >
            {messages.hero.primaryAction}
          </ButtonLink>
          <ButtonLink href={`/${locale}/sale`} variant="secondary" size="lg">
            {messages.hero.secondaryAction}
          </ButtonLink>
        </div>

        <dl className="mt-12 grid gap-3 sm:grid-cols-3">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--shell)] p-4"
            >
              <dt className="flex items-center gap-2 text-xs font-medium text-[var(--ink-faint)] [&>svg]:size-4 [&>svg]:text-[var(--accent)]">
                {stat.icon}
                {stat.label}
              </dt>
              <dd className="mt-2 text-sm font-semibold text-[var(--ink)]">{stat.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {carouselGames.length > 0 ? (
        <HeroCarousel
          games={carouselGames}
          locale={locale}
          intervalSeconds={carouselIntervalSeconds}
          labels={{
            regionLabel: messages.carousel.regionLabel,
            slideLabel: messages.carousel.slideLabel,
            goToSlide: messages.carousel.goToSlide,
            pause: messages.carousel.pause,
            play: messages.carousel.play,
            previous: common.actions.previous,
            next: common.actions.next,
            details: common.actions.details,
            featured: common.badges.featured,
          }}
        />
      ) : (
        <Bezel>
          <div className="grid gap-4 p-6">
            <h2 className="text-base font-semibold text-[var(--ink)]">
              {messages.carousel.emptyTitle}
            </h2>
            <p className="text-sm leading-6 text-[var(--ink-muted)]">
              {messages.carousel.emptyDescription}
            </p>
            <div className="mt-2 grid gap-2">
              {[messages.sections.gamesSubtitle, messages.sections.giftCardsSubtitle, messages.sections.saleSubtitle].map(
                (line) => (
                  <p
                    key={line}
                    className="rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--shell)] px-3 py-2.5 text-xs text-[var(--ink-soft)]"
                  >
                    {line}
                  </p>
                ),
              )}
            </div>
          </div>
        </Bezel>
      )}
    </div>
  );
}
