import { Link, useLoaderData } from "react-router";
import { getCloudflareContext } from "@/lib/cloudflare-context";
import { resolveImageSource } from "@/lib/images";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { APP_NAME } from "@/lib/app-config";
import { createPublicClient, getHomeData } from "@/lib/catalog-queries";
import { buildOrganizationJsonLd, buildPageMeta, getSiteUrl } from "@/lib/seo";
import { cached } from "@server/lib/cache";
import type { Route } from "./+types/locale-home";

export async function loader({ params, context }: Route.LoaderArgs) {
  const locale = params.locale ?? "";
  if (!isLocale(locale)) {
    throw new Response("Not Found", { status: 404 });
  }
  const { env } = getCloudflareContext(context);
  const siteUrl = getSiteUrl(env);
  const client = createPublicClient(env);
  // Homepage catalog changes only when the owner edits it; 15s per isolate.
  const data = await cached(`home-data:${locale}`, 15_000, () => getHomeData(client, locale));
  return { locale, siteUrl, ...data };
}

export function meta({ params, matches }: Route.MetaArgs) {
  const locale = params.locale && isLocale(params.locale) ? params.locale : DEFAULT_LOCALE;
  const content = getMessages(locale, "content");
  const homeMatch = matches.find((match) => match?.id === "routes/locale-home") as
    | { loaderData?: { heroImage?: string | null; siteUrl?: string } }
    | undefined;
  const homeData = homeMatch?.loaderData;
  return buildPageMeta({
    locale,
    title: APP_NAME,
    description: content.about.description,
    imageUrl: homeData?.heroImage ?? null,
    siteUrl: homeData?.siteUrl ?? getSiteUrl(),
  });
}

export default function LocaleHome() {
  const { locale, siteUrl, carousel, grid } = useLoaderData<typeof loader>();
  const content = getMessages(locale, "content");
  const home = getMessages(locale, "home");
  const catalog = getMessages(locale, "catalog");

  return (
    <>
      <h1 className="sr-only">{content.about.title}</h1>
      <p className="sr-only">{content.about.description}</p>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(buildOrganizationJsonLd(siteUrl)),
        }}
      />
      <section aria-roledescription="carousel" aria-label={home.carousel.regionLabel}>
        <ul className="grid gap-4 sm:grid-cols-2">
          {carousel.map((product) => (
            <li key={product.id}>
              <Link to={`/${locale}/${product.categorySlug}/${product.slug}`}>
                {product.imageUrl ? (
                  <img
                    src={resolveImageSource(product.imageUrl) ?? undefined}
                    alt={product.name}
                    loading={product === carousel[0] ? "eager" : "lazy"}
                    fetchPriority={product === carousel[0] ? "high" : "auto"}
                    className="aspect-video w-full rounded-lg object-cover"
                  />
                ) : null}
                <span className="mt-2 block font-semibold">{product.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section className="mt-10">
        <h2 className="text-xl font-bold">{catalog.games.title}</h2>
        <p className="opacity-70">{home.sections.gamesSubtitle}</p>
        <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {grid.map((product) => (
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
      </section>
    </>
  );
}
