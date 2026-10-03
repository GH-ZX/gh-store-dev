import { useState } from "react";
import { Link, useLoaderData, useRouteLoaderData } from "react-router";
import type { Route } from "./+types/locale-carousel-test";
import { getCloudflareContext } from "@/lib/cloudflare-context";
import { isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { createPublicClient } from "@/lib/catalog-queries";
import { getHomeLayout, getPublicStoreSettings } from "@server/lib/services/settings.service";
import { getHomeCarousel, resolveHomeSections } from "@server/lib/services/home.service";
import { getHomeDiscovery } from "@server/lib/services/home-discovery.service";
import { withAdminHomeCosts } from "@server/lib/services/catalog-admin-costs.service";
import { getSiteUrl } from "@/lib/seo";
import { HeroCarouselCinematic } from "@/components/home/hero-carousel-cinematic";
import { HeroCarousel } from "@/components/home/hero-carousel";
import { HomeQuickBuy, HomeCategoryShowcases } from "@/components/home/home-discovery";
import { HomeSections, HomeFallbackLinks } from "@/components/home/home-sections";
import { Section } from "@/components/ui/section";
import { LiveEditMode } from "@/components/live-edit/live-edit-mode";
import type { ChromeData } from "@/components/site-chrome";
import "@/styles/storefront-home.css";

export async function loader({ params, context }: Route.LoaderArgs) {
  const locale = params.locale ?? "ar";
  if (!isLocale(locale)) {
    throw new Response("Not Found", { status: 404 });
  }

  const { env } = getCloudflareContext(context);
  const siteUrl = getSiteUrl(env);
  const client = createPublicClient(env);
  const [layout, settings] = await Promise.all([
    getHomeLayout(client),
    getPublicStoreSettings(client),
  ]);

  const [carousel, sections] = await Promise.all([
    getHomeCarousel(client, locale, layout),
    resolveHomeSections(client, locale, layout, {
      hasSocialLinks: settings.socialLinks.length > 0,
    }),
  ]);

  const excludedSlugs = sections.flatMap((section) =>
    section.kind === "games"
      ? section.games.map((product) => product.categorySlug)
      : section.kind === "offers" && section.section.type === "gift_cards"
        ? section.offers.flatMap((offer) => (offer.game ? [offer.game.categorySlug] : []))
        : [],
  );

  const discovery = await getHomeDiscovery(client, locale, { excludeSlugs: excludedSlugs });

  return {
    locale,
    siteUrl,
    carousel,
    discovery,
    excludedSlugs,
    sections: await withAdminHomeCosts(sections),
    settings,
  };
}

export default function LocaleCarouselTest() {
  const { locale, carousel, sections, settings, discovery, excludedSlugs } = useLoaderData<typeof loader>();
  const chrome = useRouteLoaderData("routes/locale-layout") as ChromeData | undefined;
  const isActualAdmin = Boolean(chrome?.session?.isAdmin);
  const [adminMode, setAdminMode] = useState<boolean>(isActualAdmin);
  const adminMessages = getMessages(locale, "admin");
  const liveEdit = adminMode ? adminMessages.liveEdit : null;
  const common = getMessages(locale, "common");
  const home = getMessages(locale, "home");
  const catalog = getMessages(locale, "catalog");

  const [activeVersion, setActiveVersion] = useState<"cinematic" | "legacy">("cinematic");
  const isRtl = locale === "ar";

  const pageContent = (
    <div className="space-y-2">
      {/* Floating Slim Preview Bar at the Top */}
      <div className="bg-slate-950/90 border-b border-slate-800/80 py-2 px-3 backdrop-blur-xl sticky top-0 z-40 shadow-md">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <span className="text-xs font-bold text-[var(--ink)] truncate">
              {isRtl ? "معاينة حية للمتجر" : "Live Store Preview"}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Admin Simulation Toggle (For testing admin tools easily) */}
            <button
              type="button"
              onClick={() => setAdminMode((v) => !v)}
              className={`py-1 px-2.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${
                adminMode
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm"
                  : "bg-slate-900 text-slate-400 border border-slate-700/60 hover:text-white"
              }`}
              title={
                isRtl
                  ? "تبديل وضع المسؤول لتجربة أزرار التحكم والترتيب"
                  : "Toggle admin mode to test admin tools & reordering"
              }
            >
              <span className="size-2 rounded-full bg-amber-400" />
              <span>
                {adminMode
                  ? isRtl
                    ? "الأدمن: مفعّل 👑"
                    : "Admin: ON 👑"
                  : isRtl
                    ? "الأدمن: معطّل"
                    : "Admin: OFF"}
              </span>
            </button>

            {/* Version Switcher */}
            <div className="flex items-center bg-slate-900 rounded-lg p-0.5 border border-slate-700/60">
              <button
                type="button"
                onClick={() => setActiveVersion("cinematic")}
                className={`py-1 px-2.5 rounded-md text-xs font-bold transition-all ${
                  activeVersion === "cinematic"
                    ? "bg-[var(--accent)] text-[var(--accent-ink)] shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {isRtl ? "الجديد ✨" : "New ✨"}
              </button>
              <button
                type="button"
                onClick={() => setActiveVersion("legacy")}
                className={`py-1 px-2.5 rounded-md text-xs font-bold transition-all ${
                  activeVersion === "legacy"
                    ? "bg-slate-700 text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {isRtl ? "القديم" : "Legacy"}
              </button>
            </div>

            {/* Language Switch */}
            <Link
              to={locale === "ar" ? "/en/carousel-test" : "/ar/carousel-test"}
              className="py-1 px-2 rounded-md text-xs font-bold bg-slate-800 text-slate-300 hover:bg-slate-700 transition-all border border-slate-700/60"
            >
              {locale === "ar" ? "EN" : "عربي"}
            </Link>
          </div>
        </div>
      </div>

      {/* Real Store Homepage Intro */}
      <Section spacing="tight" className="sf-home-opening pt-2 pb-0">
        <div className="sf-shop-intro">
          <div>
            <h1>{home.shop.title}</h1>
            <p>{home.shop.description}</p>
          </div>
        </div>
      </Section>

      {/* Hero Carousel Section (Embedded right where it belongs) */}
      {carousel.products.length > 0 ? (
        activeVersion === "cinematic" ? (
          <HeroCarouselCinematic
            products={carousel.products}
            locale={locale}
            intervalSeconds={carousel.section?.intervalSeconds ?? 5}
            autoplay={carousel.section?.autoplay ?? true}
            loop={carousel.section?.loop ?? true}
            liveEdit={liveEdit}
            labels={{
              details: locale === "ar" ? "استكشف الباقات" : "Explore Offers",
            }}
          />
        ) : (
          <Section spacing="tight" className="sf-home-carousel">
            <HeroCarousel
              liveEdit={liveEdit}
              products={carousel.products}
              locale={locale}
              intervalSeconds={carousel.section?.intervalSeconds ?? 6}
              autoplay={carousel.section?.autoplay ?? true}
              loop={carousel.section?.loop ?? true}
              align={carousel.section?.align ?? "center"}
              imageFit={carousel.section?.imageFit ?? "cover"}
              imageAspect={carousel.section?.imageAspect ?? "auto"}
              imagePositionX={carousel.section?.imagePositionX ?? 50}
              imagePositionY={carousel.section?.imagePositionY ?? 50}
              labels={{
                ...home.carousel,
                details: common.actions.details,
                featured: common.badges.featured,
              }}
            />
          </Section>
        )
      ) : null}

      {/* Real Store Category Pills & Quick Discovery */}
      <HomeQuickBuy discovery={discovery} locale={locale} />

      {/* Real Store Product Sections */}
      {sections.length ? (
        <HomeSections
          liveEdit={liveEdit}
          locale={locale}
          sections={sections}
          common={common}
          catalog={catalog}
          home={home}
          socialLinks={settings.socialLinks}
        />
      ) : (
        <Section>
          <HomeFallbackLinks locale={locale} common={common} />
        </Section>
      )}

      {/* Real Store Category Showcases */}
      <HomeCategoryShowcases discovery={discovery} locale={locale} exclude={excludedSlugs} />
    </div>
  );

  if (liveEdit) {
    return (
      <LiveEditMode messages={liveEdit} locale={locale}>
        {pageContent}
      </LiveEditMode>
    );
  }

  return pageContent;
}
