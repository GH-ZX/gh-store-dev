import { Link, useLoaderData } from "react-router";
import { isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { getCloudflareContext } from "@/lib/cloudflare-context";
import { resolveImageSource } from "@/lib/images";
import { createPublicClient, getAllProductsPage, type ProductsPage } from "@/lib/catalog-queries";
import { buildPageMeta } from "@/lib/seo";
import type { Route } from "./+types/locale-products";

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const locale = params.locale ?? "";
  if (!isLocale(locale)) {
    throw new Response("Not Found", { status: 404 });
  }
  const { env } = getCloudflareContext(context);
  const client = createPublicClient(env);
  const page = Number(new URL(request.url).searchParams.get("page") ?? "1");
  const catalog = await getAllProductsPage(client, locale, page);
  return { locale, catalog };
}

export function meta({ params }: Route.MetaArgs) {
  const locale = params.locale && isLocale(params.locale) ? params.locale : "ar";
  const catalog = getMessages(locale, "catalog");
  return buildPageMeta({
    locale,
    path: "/products",
    title: catalog.products.title,
    description: catalog.products.description,
  });
}

export default function LocaleProducts() {
  const { locale, catalog } = useLoaderData<typeof loader>() as unknown as {
    locale: "ar" | "en";
    catalog: ProductsPage;
  };
  const copy = getMessages(locale, "catalog").products;
  const pages = Math.max(1, Math.ceil(catalog.total / catalog.pageSize));

  return (
    <>
      <h1 className="text-2xl font-bold">{copy.title}</h1>
      <p className="opacity-70">{copy.description}</p>
      <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {catalog.products.map((product) => (
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
          {catalog.page > 1 ? <Link to={`/${locale}/products?page=${catalog.page - 1}`}>←</Link> : null}
          <span>
            {catalog.page} / {pages}
          </span>
          {catalog.page < pages ? (
            <Link to={`/${locale}/products?page=${catalog.page + 1}`}>→</Link>
          ) : null}
        </nav>
      ) : null}
    </>
  );
}
