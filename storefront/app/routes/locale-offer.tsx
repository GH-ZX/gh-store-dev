import { Link, useLoaderData } from "react-router";
import { getCloudflareContext } from "@/lib/cloudflare-context";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { createPublicClient, getOfferDetail } from "@/lib/catalog-queries";
import { buildPageMeta, getSiteUrl } from "@/lib/seo";
import type { Route } from "./+types/locale-offer";

export async function loader({ params, context }: Route.LoaderArgs) {
  const locale = params.locale ?? "";
  const category = params.category ?? "";
  const gameSlug = params.slug ?? "";
  const offerSlug = params.offerSlug ?? "";
  if (!isLocale(locale)) {
    throw new Response("Not Found", { status: 404 });
  }
  const { env } = getCloudflareContext(context);
  const detail = await getOfferDetail(createPublicClient(env), locale, category, gameSlug, offerSlug);
  if (!detail) {
    throw new Response("Not Found", { status: 404 });
  }
  return { locale, category, siteUrl: getSiteUrl(env), ...detail };
}

export function meta({ params, matches }: Route.MetaArgs) {
  const locale = params.locale && isLocale(params.locale) ? params.locale : DEFAULT_LOCALE;
  const match = matches.find((m) => m?.id === "routes/locale-offer") as
    | {
        loaderData?: {
          offer?: { name?: string; description?: string | null; imageUrl?: string | null };
          product?: { name?: string };
          category?: string;
          siteUrl?: string;
        };
      }
    | undefined;
  const offer = match?.loaderData?.offer;
  const productName = match?.loaderData?.product?.name ?? "";
  const category = match?.loaderData?.category ?? params.category ?? "";
  return buildPageMeta({
    locale,
    path: `/${category}/${params.slug ?? ""}/${params.offerSlug ?? ""}`,
    title: offer?.name ? `${offer.name} — ${productName}` : "GH Store",
    description: offer?.description ?? "",
    imageUrl: offer?.imageUrl ?? null,
    siteUrl: match?.loaderData?.siteUrl ?? getSiteUrl(),
  });
}

export default function LocaleOffer() {
  const { locale, category, siteUrl, offer, product, inputFields, relatedOffers } =
    useLoaderData<typeof loader>();
  const catalog = getMessages(locale, "catalog");

  return (
    <>
      <nav aria-label="breadcrumb">
        <Link to={`/${locale}`}>GH Store</Link> /{" "}
        <Link to={`/${locale}/${category}/${product.slug}`}>{product.name}</Link> /{" "}
        <span>{offer.name}</span>
      </nav>
      <h1 className="mt-2 text-2xl font-bold">{offer.name}</h1>
      <p className="mt-2 text-xl font-bold">
        {offer.price} {offer.currency}
        {offer.discountPercent != null ? <span> −{offer.discountPercent}%</span> : null}
      </p>
      {offer.description ? <p className="mt-4 max-w-2xl">{offer.description}</p> : null}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Offer",
            name: offer.name,
            description: offer.description,
            price: offer.price,
            priceCurrency: offer.currency,
            availability: "https://schema.org/InStock",
            url: `${siteUrl}/${locale}/${category}/${product.slug}/${offer.slug}`,
          }),
        }}
      />
      {inputFields.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-lg font-bold">{catalog.gameDetail.chooseOffer}</h2>
          <ul className="mt-2 list-disc ps-5">
            {inputFields.map((field) => (
              <li key={field.id}>
                {field.label}
                {field.isRequired ? " *" : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {relatedOffers.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-lg font-bold">{catalog.gameDetail.offersHeading}</h2>
          <ul className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {relatedOffers.map((related) => (
              <li key={related.id} className="rounded-lg border p-2 text-sm">
                <Link to={`/${locale}/${category}/${product.slug}/${related.slug}`}>
                  {related.name} — {related.price} {related.currency}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
