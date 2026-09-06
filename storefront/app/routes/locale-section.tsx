import { CatalogPage, CatalogHeading, CatalogNavigation, CatalogToolbar, CatalogPager } from "@/components/store/catalog-page";
import { withAdminOfferCosts } from "@server/lib/services/catalog-admin-costs.service";
import { buildStorePageMeta } from "@/lib/store-seo";
export { CatalogErrorBoundary as ErrorBoundary } from "@/components/store/catalog-error-boundary";
import { getOfferRailPage } from "@server/lib/services/home-catalog.service";
import { EmptyState } from "@/components/shared/states";
import { ProductGrid, OfferGrid } from "@/components/store/collections";
import { getProductCardLabels, getOfferCardLabels } from "@/lib/catalog/labels";
import { getPublicStoreSettings } from "@server/lib/services/settings.service";
import type { PublicStoreSettings } from "@/lib/settings/public-settings";
import {
  AboutContent,
  FaqContent,
  HowContent,
  ContactContent,
  LinksContent,
  PrivacyContent,
  TermsContent,
  RefundsContent,
} from "@/components/content/public-pages";
import { redirect, useLoaderData } from "react-router";
import { isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { getCloudflareContext } from "@/lib/cloudflare-context";
import {
  createPublicClient,
  getCategoryPage,
  type CategoryPage,
  type OfferRail as CatalogOfferRail,
} from "@/lib/catalog-queries";
import type { StoreOffer } from "@/lib/catalog/offer-mapper";
import type { Route } from "./+types/locale-section";

const CONTENT_PAGES = [
  "about",
  "faq",
  "how",
  "contact",
  "links",
  "privacy",
  "terms",
  "refunds",
] as const;
type OfferRail = CatalogOfferRail | "best-sellers";
type ContentPage = (typeof CONTENT_PAGES)[number];

function sectionOf(
  segment: string,
):
  | { kind: "content"; page: ContentPage }
  | { kind: "rail"; rail: OfferRail }
  | { kind: "category" } {
  if ((CONTENT_PAGES as readonly string[]).includes(segment)) {
    return { kind: "content", page: segment as ContentPage };
  }
  if (
    segment === "gift-cards" ||
    segment === "sale" ||
    segment === "best-sellers"
  ) {
    return { kind: "rail", rail: segment };
  }
  return { kind: "category" };
}

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const locale = params.locale ?? "";
  const section = params.section ?? "";
  if (!isLocale(locale)) {
    throw new Response("Not Found", { status: 404 });
  }
  const { env } = getCloudflareContext(context);
  const client = createPublicClient(env);
  const resolved = sectionOf(section);

  if (resolved.kind === "content") {
    return {
      locale,
      kind: resolved.kind,
      page: resolved.page,
      settings: await getPublicStoreSettings(client),
    } as const;
  }
  if (resolved.kind === "rail") {
    const page = Number(new URL(request.url).searchParams.get("page") ?? "1");
    const result = await getOfferRailPage(client, locale, resolved.rail, page);
    if (result.page > Math.max(1, Math.ceil(result.total / result.pageSize)))
      throw redirect(`/${locale}/${resolved.rail}`);
    return {
      locale,
      kind: resolved.kind,
      rail: resolved.rail,
      ...result,
      offers: await withAdminOfferCosts(result.offers),
    } as const;
  }
  const page = Number(new URL(request.url).searchParams.get("page") ?? "1");
  const category = await getCategoryPage(client, locale, section, page);
  if (!category) {
    throw new Response("Not Found", { status: 404 });
  }
  if (
    category.page > Math.max(1, Math.ceil(category.total / category.pageSize))
  )
    throw redirect(`/${locale}/${section}`);
  return { locale, kind: resolved.kind, section, category } as const;
}

export function meta({ params, matches }: Route.MetaArgs) {
  const locale =
    params.locale && isLocale(params.locale) ? params.locale : "ar";
  const section = params.section ?? "";
  const resolved = sectionOf(section);
  const catalog = getMessages(locale, "catalog");

  if (resolved.kind === "content") {
    const content = getMessages(locale, "content")[resolved.page];
    return buildStorePageMeta(
      {
        locale,
        path: `/${resolved.page}`,
        title: content.title,
        description: content.description,
      },
      matches,
    );
  }
  if (resolved.kind === "rail") {
    const copy =
      resolved.rail === "gift-cards"
        ? catalog.giftCards
        : resolved.rail === "best-sellers"
          ? catalog.bestSellers
          : catalog.sale;
    return buildStorePageMeta(
      {
        locale,
        path: `/${resolved.rail}`,
        title: copy.title,
        description: copy.description,
      },
      matches,
    );
  }
  const match = matches.find((m) => m?.id === "routes/locale-section") as
    | { loaderData?: { category?: { categoryName?: string | null } } }
    | undefined;
  const categoryName = match?.loaderData?.category?.categoryName ?? section;
  return buildStorePageMeta(
    {
      locale,
      path: `/${section}`,
      title: categoryName,
      description: "",
    },
    matches,
  );
}

type SectionData =
  | {
      locale: "ar" | "en";
      kind: "content";
      page: ContentPage;
      settings: PublicStoreSettings;
    }
  | {
      locale: "ar" | "en";
      kind: "rail";
      rail: OfferRail;
      offers: StoreOffer[];
      page: number;
      pageSize: number;
      total: number;
    }
  | {
      locale: "ar" | "en";
      kind: "category";
      section: string;
      category: CategoryPage;
    };

export default function LocaleSection() {
  const data = useLoaderData<typeof loader>() as unknown as SectionData;
  const { locale } = data;

  if (data.kind === "content") {
    return (
      <ContentBody locale={locale} page={data.page} settings={data.settings} />
    );
  }
  if (data.kind === "rail") {
    return <RailBody {...data} />;
  }
  return (
    <CategoryBody
      locale={locale}
      section={data.section}
      category={data.category}
    />
  );
}

function ContentBody({
  locale,
  page,
  settings,
}: {
  locale: "ar" | "en";
  page: ContentPage;
  settings: PublicStoreSettings;
}) {
  const Component = {
    about: AboutContent,
    faq: FaqContent,
    how: HowContent,
    contact: ContactContent,
    links: LinksContent,
    privacy: PrivacyContent,
    terms: TermsContent,
    refunds: RefundsContent,
  }[page];
  return <div className="sf-catalog-content"><Component locale={locale} settings={settings} /></div>;
}
function RailBody({ locale, rail, offers, page, pageSize, total }: { locale: "ar" | "en"; rail: OfferRail; offers: StoreOffer[]; page: number; pageSize: number; total: number }) {
  const catalog = getMessages(locale, "catalog");
  const common = getMessages(locale, "common");
  const copy = rail === "gift-cards" ? catalog.giftCards : rail === "best-sellers" ? catalog.bestSellers : catalog.sale;
  return <CatalogPage>
    <CatalogHeading locale={locale} title={copy.title} description={copy.description} total={total} item="offers" />
    <CatalogNavigation locale={locale} active={rail} />
    <CatalogToolbar locale={locale} filter={rail === "gift-cards" ? "gift_card" : "offers"} />
    {offers.length ? <OfferGrid className="storefront-offer-grid" offers={offers} locale={locale} labels={getOfferCardLabels(common, catalog)} /> : <EmptyState title={common.states.emptyTitle} description={common.states.emptyDescription} />}
    <CatalogPager locale={locale} path={rail} page={page} pageSize={pageSize} total={total} />
  </CatalogPage>;
}

function CategoryBody({ locale, section, category }: { locale: "ar" | "en"; section: string; category: CategoryPage }) {
  const common = getMessages(locale, "common");
  const catalog = getMessages(locale, "catalog");
  return <CatalogPage>
    <CatalogHeading locale={locale} title={category.categoryName ?? section} total={category.total} />
    <CatalogNavigation locale={locale} active={section} />
    <CatalogToolbar locale={locale} />
    {category.products.length ? <ProductGrid className="storefront-catalog-grid" games={category.products} locale={locale} labels={getProductCardLabels(common, catalog)} /> : <EmptyState title={common.states.emptyTitle} description={common.states.emptyDescription} />}
    <CatalogPager locale={locale} path={section} page={category.page} pageSize={category.pageSize} total={category.total} />
  </CatalogPage>;
}
