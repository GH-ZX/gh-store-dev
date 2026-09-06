import { Link, useLoaderData } from "react-router";
import { getCloudflareContext } from "@/lib/cloudflare-context";
import { resolveImageSource } from "@/lib/images";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { createPublicClient, getProductDetail } from "@/lib/catalog-queries";
import { buildPageMeta, getSiteUrl } from "@/lib/seo";
import type { Route } from "./+types/locale-product";

export async function loader({ params, context }: Route.LoaderArgs) {
  const locale = params.locale ?? "";
  const category = params.category ?? "";
  const slug = params.slug ?? "";
  if (!isLocale(locale)) {
    throw new Response("Not Found", { status: 404 });
  }
  const { env } = getCloudflareContext(context);
  const detail = await getProductDetail(createPublicClient(env), locale, slug, category);
  if (!detail) {
    throw new Response("Not Found", { status: 404 });
  }
  return { locale, category, siteUrl: getSiteUrl(env), ...detail };
}

export function meta({ params, matches }: Route.MetaArgs) {
  const locale = params.locale && isLocale(params.locale) ? params.locale : DEFAULT_LOCALE;
  const match = matches.find((m) => m?.id === "routes/locale-product") as
    | {
        loaderData?: {
          product?: { name?: string; description?: string | null; imageUrl?: string | null };
          category?: string;
          siteUrl?: string;
        };
      }
    | undefined;
  const product = match?.loaderData?.product;
  const category = match?.loaderData?.category ?? params.category ?? "";
  const slug = params.slug ?? "";
  return buildPageMeta({
    locale,
    path: `/${category}/${slug}`,
    title: product?.name ?? "GH Store",
    description: product?.description ?? "",
    imageUrl: product?.imageUrl ?? null,
    siteUrl: match?.loaderData?.siteUrl ?? getSiteUrl(),
  });
}

export default function LocaleProduct() {
  const { locale, category, siteUrl, product, offers } = useLoaderData<typeof loader>();
  const catalog = getMessages(locale, "catalog");
  const cheapest = offers.length > 0 ? Math.min(...offers.map((offer) => offer.price)) : null;

  return (
    <>
      <nav aria-label="breadcrumb">
        <Link to={`/${locale}`}>GH Store</Link> /{" "}
        <Link to={`/${locale}/games`}>{catalog.games.title}</Link> / <span>{product.name}</span>
      </nav>
      <h1 className="mt-2 text-2xl font-bold">{product.name}</h1>
      {product.imageUrl ? (
        <img
          src={resolveImageSource(product.imageUrl) ?? undefined}
          alt={product.name}
          fetchPriority="high"
          className="mt-4 aspect-video w-full max-w-2xl rounded-lg object-cover"
        />
      ) : null}
      {product.description ? <p className="mt-4 max-w-2xl">{product.description}</p> : null}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            {
              "@context": "https://schema.org",
              "@type": "Product",
              name: product.name,
              description: product.description,
              image: product.imageUrl ?? undefined,
              url: `${siteUrl}/${locale}/${category}/${product.slug}`,
              offers: {
                "@type": "AggregateOffer",
                lowPrice: cheapest,
                offerCount: offers.length,
                priceCurrency: offers[0]?.currency ?? "USD",
              },
            },
            {
              "@context": "https://schema.org",
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "GH Store", item: `${siteUrl}/${locale}` },
                {
                  "@type": "ListItem",
                  position: 2,
                  name: catalog.games.title,
                  item: `${siteUrl}/${locale}/games`,
                },
                { "@type": "ListItem", position: 3, name: product.name },
              ],
            },
          ]),
        }}
      />
      <h2 className="mt-8 text-xl font-bold">{catalog.gameDetail.offersHeading}</h2>
      {offers.length === 0 ? (
        <p className="opacity-70">{catalog.gameDetail.emptyTitle}</p>
      ) : (
        <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {offers.map((offer) => (
            <li key={offer.id} className="rounded-lg border p-3">
              <Link to={`/${locale}/${category}/${product.slug}/${offer.slug}`}>
                <span className="block text-sm font-medium">{offer.name}</span>
                <span className="mt-1 block font-bold">
                  {offer.price} {offer.currency}
                </span>
                {offer.discountPercent != null ? <span>−{offer.discountPercent}%</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
