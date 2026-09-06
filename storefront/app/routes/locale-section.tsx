import { Link, useLoaderData } from "react-router";
import { isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { getCloudflareContext } from "@/lib/cloudflare-context";
import { resolveImageSource } from "@/lib/images";
import {
  createPublicClient,
  getCategoryPage,
  getOfferRail,
  type CategoryPage,
  type OfferRail,
} from "@/lib/catalog-queries";
import type { StoreOffer } from "@/lib/catalog/offer-mapper";
import { buildPageMeta } from "@/lib/seo";
import type { Route } from "./+types/locale-section";

const CONTENT_PAGES = ["about", "faq", "how", "contact", "links", "privacy", "terms", "refunds"] as const;
type ContentPage = (typeof CONTENT_PAGES)[number];
type SectionKind = ContentPage | OfferRail | "category";

function sectionOf(segment: string): { kind: "content"; page: ContentPage } | { kind: "rail"; rail: OfferRail } | { kind: "category" } {
  if ((CONTENT_PAGES as readonly string[]).includes(segment)) {
    return { kind: "content", page: segment as ContentPage };
  }
  if (segment === "gift-cards" || segment === "sale") {
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
    return { locale, kind: resolved.kind, page: resolved.page } as const;
  }
  if (resolved.kind === "rail") {
    const offers = await getOfferRail(client, locale, resolved.rail);
    return { locale, kind: resolved.kind, rail: resolved.rail, offers } as const;
  }
  const page = Number(new URL(request.url).searchParams.get("page") ?? "1");
  const category = await getCategoryPage(client, locale, section, page);
  if (!category) {
    throw new Response("Not Found", { status: 404 });
  }
  return { locale, kind: resolved.kind, section, category } as const;
}

export function meta({ params, matches }: Route.MetaArgs) {
  const locale = params.locale && isLocale(params.locale) ? params.locale : "ar";
  const section = params.section ?? "";
  const resolved = sectionOf(section);
  const catalog = getMessages(locale, "catalog");

  if (resolved.kind === "content") {
    const content = getMessages(locale, "content")[resolved.page];
    return buildPageMeta({ locale, path: `/${resolved.page}`, title: content.title, description: content.description });
  }
  if (resolved.kind === "rail") {
    const copy = resolved.rail === "gift-cards" ? catalog.giftCards : catalog.sale;
    return buildPageMeta({ locale, path: `/${resolved.rail}`, title: copy.title, description: copy.description });
  }
  const match = matches.find((m) => m?.id === "routes/locale-section") as
    | { loaderData?: { category?: { categoryName?: string | null } } }
    | undefined;
  const categoryName = match?.loaderData?.category?.categoryName ?? section;
  return buildPageMeta({ locale, path: `/${section}`, title: categoryName, description: "" });
}

type SectionData =
  | { locale: "ar" | "en"; kind: "content"; page: ContentPage }
  | { locale: "ar" | "en"; kind: "rail"; rail: OfferRail; offers: StoreOffer[] }
  | { locale: "ar" | "en"; kind: "category"; section: string; category: CategoryPage };

export default function LocaleSection() {
  const data = useLoaderData<typeof loader>() as unknown as SectionData;
  const { locale } = data;

  if (data.kind === "content") {
    return <ContentBody locale={locale} page={data.page} />;
  }
  if (data.kind === "rail") {
    return <RailBody locale={locale} rail={data.rail} offers={data.offers} />;
  }
  return <CategoryBody locale={locale} section={data.section} category={data.category} />;
}

function ContentBody({ locale, page }: { locale: "ar" | "en"; page: ContentPage }) {
  const content = getMessages(locale, "content")[page];
  return (
    <>
      <h1 className="text-2xl font-bold">{content.title}</h1>
      <p className="opacity-70">{content.description}</p>
      {"items" in content && Array.isArray(content.items) ? (
        <ul className="mt-6 flex flex-col gap-4">
          {content.items.map((item: { question: string; answer: string }, index: number) => (
            <li key={index} className="rounded-lg border p-4">
              <h2 className="font-bold">{item.question}</h2>
              <p className="mt-1">{item.answer}</p>
            </li>
          ))}
        </ul>
      ) : null}
      {"steps" in content && Array.isArray(content.steps) ? (
        <ol className="mt-6 flex flex-col gap-4">
          {content.steps.map(
            (step: { title: string; description?: string; body?: string }, index: number) => (
              <li key={index} className="rounded-lg border p-4">
                <h2 className="font-bold">{step.title}</h2>
                <p className="mt-1">{step.description ?? step.body}</p>
              </li>
            ),
          )}
        </ol>
      ) : null}
      {"sections" in content && Array.isArray(content.sections) ? (
        <div className="mt-6 flex flex-col gap-6">
          {content.sections.map(
            (
              section: { heading: string; body?: string; paragraphs?: string[] },
              index: number,
            ) => (
              <section key={index}>
                <h2 className="text-lg font-bold">{section.heading}</h2>
                {section.body ? <p className="mt-1">{section.body}</p> : null}
                {section.paragraphs?.map((paragraph, paragraphIndex) => (
                  <p key={paragraphIndex} className="mt-2">
                    {paragraph}
                  </p>
                ))}
              </section>
            ),
          )}
        </div>
      ) : null}
    </>
  );
}

function RailBody({ locale, rail, offers }: { locale: "ar" | "en"; rail: OfferRail; offers: StoreOffer[] }) {
  const catalog = getMessages(locale, "catalog");
  const copy = rail === "gift-cards" ? catalog.giftCards : catalog.sale;
  return (
    <>
      <h1 className="text-2xl font-bold">{copy.title}</h1>
      <p className="opacity-70">{copy.description}</p>
      <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {offers.map((offer) => (
          <li key={offer.id} className="rounded-lg border p-3">
            <Link to={`/${locale}/${offer.game?.categorySlug ?? "games"}/${offer.game?.slug ?? ""}/${offer.slug}`}>
              <span className="block text-sm font-medium">{offer.name}</span>
              <span className="mt-1 block font-bold">
                {offer.price} {offer.currency}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

function CategoryBody({
  locale,
  section,
  category,
}: {
  locale: "ar" | "en";
  section: string;
  category: CategoryPage;
}) {
  const pages = Math.max(1, Math.ceil(category.total / category.pageSize));
  return (
    <>
      <h1 className="text-2xl font-bold">{category.categoryName ?? section}</h1>
      <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {category.products.map((product) => (
          <li key={product.id} className="rounded-lg border p-3">
            <Link to={`/${locale}/${product.categorySlug}/${product.slug}`}>
              {product.imageUrl ? (
                <img
                  src={resolveImageSource(product.imageUrl) ?? undefined}
                  alt={product.name}
                  loading="lazy"
                  className="aspect-square w-full rounded object-cover"
                />
              ) : null}
              <span className="mt-2 block text-sm font-medium">{product.name}</span>
              {product.priceFrom != null ? (
                <span className="text-sm opacity-70">{product.priceFrom}</span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
      {pages > 1 ? (
        <nav aria-label="pagination" className="mt-6 flex gap-2">
          {category.page > 1 ? <Link to={`/${locale}/${section}?page=${category.page - 1}`}>←</Link> : null}
          <span>
            {category.page} / {pages}
          </span>
          {category.page < pages ? (
            <Link to={`/${locale}/${section}?page=${category.page + 1}`}>→</Link>
          ) : null}
        </nav>
      ) : null}
    </>
  );
}
