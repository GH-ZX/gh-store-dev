import { HeroCarousel } from "@/components/home/hero-carousel";
import { Eyebrow } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { ArrowIcon, BoltIcon, GamepadIcon, ShieldIcon, SparkIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";
import type { CommonMessages, HomeMessages } from "@/i18n/messages";
import type { StoreGame } from "@/lib/catalog/game-mapper";
import { cn } from "@/lib/cn";

/**
 * Homepage hero.
 *
 * Asymmetric split when featured games exist: the pitch and calls to action on
 * one side, the carousel on the other. With no featured game the hero becomes a
 * single centred column instead of pairing the copy with a placeholder — a panel
 * explaining that the carousel is unconfigured is dashboard feedback, and a
 * customer should never be shown it.
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
  const hasCarousel = carouselGames.length > 0;

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
    <div
      className={cn(
        "grid gap-10",
        hasCarousel && "lg:grid-cols-[1.15fr_minmax(0,0.85fr)] lg:items-center lg:gap-14",
      )}
    >
      <div className={cn("gh-rise", !hasCarousel && "mx-auto max-w-3xl text-center")}>
        <Eyebrow icon={<SparkIcon />}>{messages.hero.eyebrow}</Eyebrow>

        <h1 className="mt-5 text-[clamp(2.5rem,7vw,4.5rem)] leading-[1.02] font-semibold tracking-[-0.04em] text-[var(--ink)]">
          {messages.hero.title}
        </h1>

        <p
          className={cn(
            "mt-6 max-w-xl text-base leading-7 text-[var(--ink-soft)] sm:text-lg sm:leading-8",
            !hasCarousel && "mx-auto",
          )}
        >
          {messages.hero.description}
        </p>

        <div
          className={cn(
            "mt-9 flex flex-wrap items-center gap-3",
            !hasCarousel && "justify-center",
          )}
        >
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
              className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--shell)] p-4 text-start"
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

      {hasCarousel ? (
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
      ) : null}
    </div>
  );
}
