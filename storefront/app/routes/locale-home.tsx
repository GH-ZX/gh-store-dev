import { withAdminHomeCosts } from "@server/lib/services/catalog-admin-costs.service";
import { buildStorePageMeta } from "@/lib/store-seo";
export { CatalogErrorBoundary as ErrorBoundary } from "@/components/store/catalog-error-boundary";
import type { ChromeData } from "@/components/site-chrome";
import { LiveEditMode } from "@/components/live-edit/live-edit-mode";
import { useLoaderData, useRouteLoaderData } from "react-router";
import { getCloudflareContext } from "@/lib/cloudflare-context";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { buildBrandName } from "@/lib/brand";
import { createPublicClient } from "@/lib/catalog-queries";
import { buildOrganizationJsonLd, getSiteUrl } from "@/lib/seo";
import {
  getHomeLayout,
  getPublicStoreSettings,
} from "@server/lib/services/settings.service";
import {
  getHomeCarousel,
  resolveHomeSections,
} from "@server/lib/services/home.service";
import { HeroCarousel } from "@/components/home/hero-carousel";
import "@/styles/storefront-home.css";
import {
  HomeSections,
  HomeFallbackLinks,
} from "@/components/home/home-sections";
import { Section } from "@/components/ui/section";
import type { Route } from "./+types/locale-home";

export async function loader({ params, context }: Route.LoaderArgs) {
  const locale = params.locale ?? "";
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
  return {
    locale,
    siteUrl,
    carousel,
    sections: await withAdminHomeCosts(sections),
    settings,
  };
}

export function meta({ params, matches }: Route.MetaArgs) {
  const locale = params.locale && isLocale(params.locale) ? params.locale : DEFAULT_LOCALE;
  const home = getMessages(locale, "home");
  return buildStorePageMeta({
    locale,
    title: home.shop.seoTitle,
    description: home.shop.seoDescription,
    imageUrl: "/storefront/gh-store-social.png",
    imageAlt: "GH Store",
  }, matches);
}

export default function LocaleHome() {
  const { locale, siteUrl, carousel, sections, settings } = useLoaderData<typeof loader>();
  const chrome = useRouteLoaderData("routes/locale-layout") as
    ChromeData | undefined;
  const liveEdit = chrome?.session?.isAdmin
    ? getMessages(locale, "admin").liveEdit
    : null;
  const common = getMessages(locale, "common");
  const home = getMessages(locale, "home");
  const catalog = getMessages(locale, "catalog");
  const page = (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(buildOrganizationJsonLd(siteUrl, settings.branding.useEverywhere ? buildBrandName(settings, locale) : undefined)).replace(
            /</g,
            "\\u003c",
          ),
        }}
      />
      <Section spacing="page" className="sf-home-opening">
        <div className="sf-shop-intro">
          <div>
            <h1>{home.shop.title}</h1>
            <p>{home.shop.description}</p>
          </div>
        </div>
        {carousel.products.length > 0 ? (
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
        ) : null}
      </Section>
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
    </>
  );
  return liveEdit ? (
    <LiveEditMode messages={liveEdit} locale={locale}>
      {page}
    </LiveEditMode>
  ) : (
    page
  );
}
