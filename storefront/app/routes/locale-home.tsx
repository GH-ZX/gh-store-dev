import { withAdminHomeCosts } from "@server/lib/services/catalog-admin-costs.service";
import { buildStorePageMeta } from "@/lib/store-seo";
export { CatalogErrorBoundary as ErrorBoundary } from "@/components/store/catalog-error-boundary";
import type { ChromeData } from "@/components/site-chrome";
import { LiveEditMode } from "@/components/live-edit/live-edit-mode";
import { useLoaderData, useRouteLoaderData } from "react-router";
import { getCloudflareContext } from "@/lib/cloudflare-context";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { APP_NAME } from "@/lib/app-config";
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
import { StorefrontCampaign } from "@/components/home/storefront-campaign";
import { HomeDiscovery } from "@/components/home/home-discovery";
import { getHomeDiscoveryCategories } from "@server/lib/services/home-discovery.service";
import { HeroCarousel } from "@/components/home/hero-carousel";
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
  const [layout, settings, categories] = await Promise.all([
    getHomeLayout(client),
    getPublicStoreSettings(client),
    getHomeDiscoveryCategories(client, locale),
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
    categories,
    sections: await withAdminHomeCosts(sections),
    settings,
    heroImage: carousel.products[0]?.imageUrl ?? null,
  };
}

export const links: Route.LinksFunction = () => [
  {
    rel: "preload",
    as: "image",
    href: "/storefront/digital-essentials-v2.webp",
    fetchPriority: "high",
  },
];

export function meta({ params, matches }: Route.MetaArgs) {
  const locale =
    params.locale && isLocale(params.locale) ? params.locale : DEFAULT_LOCALE;
  const content = getMessages(locale, "content");
  const homeMatch = matches.find(
    (match) => match?.id === "routes/locale-home",
  ) as
    | { loaderData?: { heroImage?: string | null; siteUrl?: string } }
    | undefined;
  const homeData = homeMatch?.loaderData;
  return buildStorePageMeta(
    {
      locale,
      title: APP_NAME,
      description: content.about.description,
      imageUrl: homeData?.heroImage ?? null,
      siteUrl: homeData?.siteUrl ?? getSiteUrl(),
    },
    matches,
  );
}

export default function LocaleHome() {
  const { locale, siteUrl, carousel, sections, settings, categories } =
    useLoaderData<typeof loader>();
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
          __html: JSON.stringify(buildOrganizationJsonLd(siteUrl)).replace(
            /</g,
            "\\u003c",
          ),
        }}
      />
      <Section spacing="page" className="sf-home-opening">
        <StorefrontCampaign locale={locale} />
        <HomeDiscovery categories={categories} locale={locale} />
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
