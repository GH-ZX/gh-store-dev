import { Form, Link, useLoaderData, useNavigation } from "react-router";
import { getCloudflareContext } from "@/lib/cloudflare-context";
import { resolveImageSource } from "@/lib/images";
import { isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { createPublicClient, searchProducts } from "@/lib/catalog-queries";
import { buildPageMeta } from "@/lib/seo";
import type { Route } from "./+types/locale-search";

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const locale = params.locale ?? "";
  if (!isLocale(locale)) {
    throw new Response("Not Found", { status: 404 });
  }
  const { env } = getCloudflareContext(context);
  const q = new URL(request.url).searchParams.get("q") ?? "";
  const result = await searchProducts(createPublicClient(env), locale, q);
  return { locale, ...result };
}

export function meta({ params }: Route.MetaArgs) {
  const locale = params.locale && isLocale(params.locale) ? params.locale : "ar";
  const search = getMessages(locale, "search");
  return buildPageMeta({
    locale,
    path: "/search",
    title: search.title,
    description: search.description,
    noIndex: true,
  });
}

export default function LocaleSearch() {
  const { locale, products, query } = useLoaderData<typeof loader>();
  const search = getMessages(locale, "search");
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";

  return (
    <>
      <h1 className="text-2xl font-bold">{search.title}</h1>
      <p className="opacity-70">{search.description}</p>
      <Form method="get" className="mt-4 flex gap-2" replace>
        <label className="sr-only" htmlFor="q">
          {search.fieldLabel}
        </label>
        <input
          id="q"
          name="q"
          defaultValue={query}
          placeholder={search.placeholder}
          maxLength={80}
          className="w-full max-w-md rounded border p-2"
        />
        <button type="submit" disabled={busy} className="rounded border px-4">
          {search.submit}
        </button>
      </Form>
      {query ? (
        <p className="mt-4 text-sm opacity-70">
          {products.length} — {query}
        </p>
      ) : null}
      <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {products.map((product) => (
          <li key={product.id} className="rounded-lg border p-3">
            <Link to={`/${locale}/${product.categorySlug}/${product.slug}`}>
              {product.imageUrl ? (
                <img
                  src={resolveImageSource(product.imageUrl, 640) ?? undefined}
                  alt={product.name}
                  loading="lazy"
                  className="aspect-square w-full rounded object-cover"
                />
              ) : null}
              <span className="mt-2 block text-sm font-medium">{product.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
