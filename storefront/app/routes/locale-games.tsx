import { Link, useLoaderData } from "react-router";
import { getCloudflareContext } from "@/lib/cloudflare-context";
import { resolveImageSource } from "@/lib/images";
import { isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { createPublicClient, getCatalogPage } from "@/lib/catalog-queries";
import { buildPageMeta, getSiteUrl } from "@/lib/seo";
import type { Route } from "./+types/locale-games";

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const locale = params.locale ?? "";
  if (!isLocale(locale)) {
    throw new Response("Not Found", { status: 404 });
  }
  const { env } = getCloudflareContext(context);
  const page = Number(new URL(request.url).searchParams.get("page") ?? "1");
  const catalog = await getCatalogPage(createPublicClient(env), locale, page);
  return { locale, siteUrl: getSiteUrl(env), ...catalog };
}

export function meta({ params }: Route.MetaArgs) {
  const locale = params.locale && isLocale(params.locale) ? params.locale : "ar";
  const catalog = getMessages(locale, "catalog");
  return buildPageMeta({
    locale,
    path: "/games",
    title: catalog.games.title,
    description: catalog.games.description,
  });
}

export default function LocaleGames() {
  const { locale, products, total, page, pageSize } = useLoaderData<typeof loader>();
  const catalog = getMessages(locale, "catalog");
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <>
      <h1 className="text-2xl font-bold">{catalog.games.title}</h1>
      <p className="opacity-70">{catalog.games.description}</p>
      <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {products.map((product) => (
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
          {page > 1 ? <Link to={`/${locale}/games?page=${page - 1}`}>←</Link> : null}
          <span>
            {page} / {pages}
          </span>
          {page < pages ? <Link to={`/${locale}/games?page=${page + 1}`}>→</Link> : null}
        </nav>
      ) : null}
    </>
  );
}
