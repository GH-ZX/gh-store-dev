import type { Metadata } from "next";
import { preload } from "react-dom";
import { HeroCarousel } from "@/components/home/hero-carousel";
import { HomeFallbackLinks, HomeSections } from "@/components/home/home-sections";
import { LiveEditMode } from "@/components/live-edit/live-edit-mode";
import { Section } from "@/components/ui/section";
import { getMessages } from "@/i18n/messages";
import { buildBrandName } from "@/lib/brand";
import { resolveLocaleParam } from "@/lib/routing/locale-params";
import { buildPageMetadata } from "@/lib/seo";
import { getHomeCarousel, resolveHomeSections } from "@/lib/services/home.service";
import { getSessionSummary } from "@/lib/services/session.service";
import { getHomeLayout, getPublicStoreSettings } from "@/lib/services/settings.service";

export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const home = getMessages(locale, "home");
  const settings = await getPublicStoreSettings();

  const description =
    (locale === "ar" ? settings.seo.descriptionAr : settings.seo.descriptionEn) || home.hero.description;

  const metadata = buildPageMetadata({
    locale,
    title: "",
    description,
    imageUrl: settings.seo.ogImageUrl,
  });

  /*
   * The homepage tab is the owner's to name: the configured site name always
   * wins here (Arabic preferred, then English, then the built-in brand), read
   * as an absolute title so the root template's "· GH Store" suffix is skipped.
   */
  metadata.title = {
    absolute: settings.branding.nameAr.trim() || settings.branding.nameEn.trim() || buildBrandName(settings, locale),
  };

  return metadata;
}

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const locale = await resolveLocaleParam(params);
  const common = getMessages(locale, "common");
  const catalog = getMessages(locale, "catalog");
  const home = getMessages(locale, "home");

  const [layout, settings, session] = await Promise.all([
    getHomeLayout(),
    getPublicStoreSettings(),
    getSessionSummary(),
  ]);
  const [carousel, sections] = await Promise.all([
    getHomeCarousel(locale, layout),
    resolveHomeSections(locale, layout, { hasSocialLinks: settings.socialLinks.length > 0 }),
  ]);

  /*
   * The owner edits the homepage on the homepage.
   *
   * Everything here is also on the dashboard, and that is the point: an owner
   * who can see that a heading reads wrong or that a game is showing the wrong
   * artwork should not have to work out which of eleven cards owns it and then
   * navigate back to check. Passing the messages rather than a flag keeps the
   * dashboard's copy out of a visitor's page, and every action re-checks the
   * administrator behind it — a rendered pencil is a hint, not a permission.
   */
  const liveEdit = session?.isAdmin ? getMessages(locale, "admin").liveEdit : null;

  /*
   * The first slide's artwork is the largest thing on the page and the last
   * thing to arrive: it is discovered only once the browser has parsed the HTML
   * and reached the image, and supplier image hosts are not fast — one measured
   * here took eleven seconds to hand over 178 KB. Naming it in the head starts
   * the connection and the download while the rest of the document is still
   * being read, which is most of that time back on a slow line.
   *
   * React deduplicates this against the `img` that renders it, so the browser
   * makes one request and not two — and the connection it opens is reused by
   * the remaining slides, which come from the same host.
   */
  const heroImage = carousel.games[0]?.imageUrl;

  if (heroImage) {
    preload(heroImage, { as: "image", fetchPriority: "high" });
  }

  /*
   * The homepage must carry the store's name and what it does in text a crawler
   * or a brand review can read, but the carousel is what a visitor sees. Keeping
   * the name, the SEO title, and the one-line description in the document (see
   * the hidden block below) satisfies both without drawing a copy block above
   * the games.
   */
  const heading = (locale === "ar" ? settings.seo.titleAr : settings.seo.titleEn) || home.hero.title;
  const brandName = buildBrandName(settings, locale);

  const page = (
    <>
      {/*
        * One visible line above the carousel carrying the store's name and what
        * it does. A quiet equaliser rather than a pitch — this is the text a
        * visitor reads to learn what the page is, and the text a brand review
        * reads for the same answer. The heading stays `sr-only` so the outline
        * still opens at level one without drawing a second, louder block.
        */}
      <p className="mb-4 text-center text-sm leading-6 text-[var(--ink-soft)] sm:text-base">
        <span className="font-brand font-semibold tracking-[0.08em] text-[var(--ink)]">{brandName}</span>
        <span className="mx-2 text-[var(--accent)]" aria-hidden="true">
          ·
        </span>
        {home.hero.description}
      </p>

      <div className="sr-only">
        <h1>{heading}</h1>
      </div>

      {/*
        * The carousel leads. There used to be a pitch above it — a headline, two
        * buttons and three stat tiles — which pushed the actual games below the
        * fold on a phone and told a visitor nothing they had not already assumed
        * by arriving. The games are the pitch.
        */}
      {carousel.games.length > 0 ? (
        <Section spacing="page" mesh>
          <HeroCarousel
            games={carousel.games}
            locale={locale}
            intervalSeconds={carousel.section?.intervalSeconds ?? 6}
            autoplay={carousel.section?.autoplay ?? true}
            loop={carousel.section?.loop ?? true}
            align={carousel.section?.align ?? "center"}
            labels={{
              regionLabel: home.carousel.regionLabel,
              slideLabel: home.carousel.slideLabel,
              goToGame: home.carousel.goToGame,
              previous: home.carousel.previous,
              next: home.carousel.next,
              details: common.actions.details,
              featured: common.badges.featured,
            }}
            liveEdit={liveEdit}
          />
        </Section>
      ) : null}

      {sections.length > 0 ? (
        <HomeSections
          locale={locale}
          sections={sections}
          common={common}
          catalog={catalog}
          home={home}
          socialLinks={settings.socialLinks}
          liveEdit={liveEdit}
        />
      ) : (
        <Section spacing="normal">
          <HomeFallbackLinks locale={locale} common={common} />
        </Section>
      )}
    </>
  );

  if (!liveEdit) {
    return page;
  }

  // The provider wraps the server-rendered page as children, which is what lets
  // a pencil deep inside a server component read a piece of client state.
  return <LiveEditMode messages={liveEdit}>{page}</LiveEditMode>;
}
