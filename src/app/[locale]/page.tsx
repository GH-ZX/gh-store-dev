import type { Metadata } from "next";
import { HomeFallbackLinks, HomeSections } from "@/components/home/home-sections";
import { HomeHero } from "@/components/home/home-hero";
import { Section } from "@/components/ui/section";
import { getMessages } from "@/i18n/messages";
import { resolveLocaleParam } from "@/lib/routing/locale-params";
import { buildPageMetadata } from "@/lib/seo";
import { getHomeCarousel, resolveHomeSections } from "@/lib/services/home.service";
import { getHomeLayout, getPublicStoreSettings } from "@/lib/services/settings.service";

export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const home = getMessages(locale, "home");
  const settings = await getPublicStoreSettings();

  const title = (locale === "ar" ? settings.seo.titleAr : settings.seo.titleEn) || home.hero.title;
  const description =
    (locale === "ar" ? settings.seo.descriptionAr : settings.seo.descriptionEn) || home.hero.description;

  return buildPageMetadata({
    locale,
    title,
    description,
    imageUrl: settings.seo.ogImageUrl,
  });
}

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const locale = await resolveLocaleParam(params);
  const common = getMessages(locale, "common");
  const catalog = getMessages(locale, "catalog");
  const home = getMessages(locale, "home");

  const [layout, settings] = await Promise.all([getHomeLayout(), getPublicStoreSettings()]);
  const [carousel, sections] = await Promise.all([
    getHomeCarousel(locale, layout),
    resolveHomeSections(locale, layout),
  ]);

  return (
    <>
      <Section spacing="page" mesh>
        <HomeHero
          locale={locale}
          common={common}
          messages={home}
          carouselGames={carousel.games}
          carouselIntervalSeconds={carousel.section?.intervalSeconds ?? 6}
        />
      </Section>

      {sections.length > 0 ? (
        <HomeSections
          locale={locale}
          sections={sections}
          common={common}
          catalog={catalog}
          home={home}
          socialLinks={settings.socialLinks}
        />
      ) : (
        <Section spacing="normal">
          <HomeFallbackLinks locale={locale} common={common} />
        </Section>
      )}
    </>
  );
}
