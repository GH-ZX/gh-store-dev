import { data, Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import { z } from "zod";
import { isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { getCloudflareContext } from "@/lib/cloudflare-context";
import { buildPageMeta } from "@/lib/seo";
import {
  createAdminProduct,
  listAdminCategories,
  listAdminProducts,
  listAdminProviderCategories,
  SlugTakenError,
  type AdminCategory,
  type AdminProductListItem,
  type AdminProviderCategory,
} from "@server/lib/services/admin-catalog.service";
import { PRODUCT_KINDS } from "@/lib/product-kind";
import { getSessionSummary } from "@server/lib/services/session.service";
import { createSessionClient, getSessionUserId, redirectToLogin, sessionCookieHeaders, withSessionCookies } from "@server/session";
import type { Route } from "./+types/dashboard-catalog";

const CreateSchema = z.object({
  nameAr: z.string().trim().min(1).max(160),
  nameEn: z.string().trim().min(1).max(160),
  slug: z.string().trim().min(1).max(80),
  productKind: z.enum(PRODUCT_KINDS),
});

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const locale = params.locale ?? "";
  if (!isLocale(locale)) {
    throw new Response("Not Found", { status: 404 });
  }
  const { env } = getCloudflareContext(context);
  const { supabase, jar, isProduction } = createSessionClient(request, env);
  const userId = await getSessionUserId(supabase);
  if (!userId) {
    return withSessionCookies(
      redirectToLogin(request, locale, `/${locale}/dashboard/catalog`),
      jar,
      isProduction,
    );
  }
  const session = await getSessionSummary(supabase, userId);
  if (!session?.isAdmin) {
    throw new Response("Forbidden", { status: 403 });
  }
  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";
  const category = url.searchParams.get("category") ?? "";
  const publishedOnly = url.searchParams.get("published") === "1";
  const [products, categories, providerCategories] = await Promise.all([
    listAdminProducts(supabase, true, {
      query,
      publishedOnly,
      category: category || undefined,
    }),
    listAdminCategories(supabase, true),
    listAdminProviderCategories(supabase, true),
  ]);
  return data(
    { locale, query, category, publishedOnly, products, categories, providerCategories },
    { headers: sessionCookieHeaders(jar, isProduction) },
  );
}

export async function action({ params, request, context }: Route.ActionArgs) {
  const locale = params.locale ?? "";
  if (!isLocale(locale)) {
    throw new Response("Not Found", { status: 404 });
  }
  const { env } = getCloudflareContext(context);
  const { supabase, jar, isProduction } = createSessionClient(request, env);
  const userId = await getSessionUserId(supabase);
  if (!userId) {
    return withSessionCookies(
      redirectToLogin(request, locale, `/${locale}/dashboard/catalog`),
      jar,
      isProduction,
    );
  }
  const session = await getSessionSummary(supabase, userId);
  if (!session?.isAdmin) {
    throw new Response("Forbidden", { status: 403 });
  }
  const form = await request.formData();
  const parsed = CreateSchema.safeParse({
    nameAr: form.get("nameAr"),
    nameEn: form.get("nameEn"),
    slug: form.get("slug"),
    productKind: form.get("productKind"),
  });
  if (!parsed.success) {
    return data(
      { ok: false as const, error: "invalid_input" },
      { status: 400, headers: sessionCookieHeaders(jar, isProduction) },
    );
  }
  try {
    const id = await createAdminProduct(supabase, true, parsed.data);
    return withSessionCookies(redirect(`/${locale}/dashboard/catalog/${id}`), jar, isProduction);
  } catch (error) {
    const key = error instanceof SlugTakenError ? "slug_taken" : "unknown";
    return data(
      { ok: false as const, error: key },
      { status: 400, headers: sessionCookieHeaders(jar, isProduction) },
    );
  }
}

export function meta({ params }: Route.MetaArgs) {
  const locale = params.locale && isLocale(params.locale) ? params.locale : "ar";
  return buildPageMeta({ locale, path: "/dashboard/catalog", title: "Catalog", description: "", noIndex: true });
}

export default function DashboardCatalog() {
  const { locale, query, category, publishedOnly, products, categories, providerCategories } =
    useLoaderData<typeof loader>() as unknown as {
      locale: "ar" | "en";
      query: string;
      category: string;
      publishedOnly: boolean;
      products: AdminProductListItem[];
      categories: AdminCategory[];
      providerCategories: AdminProviderCategory[];
    };
  const actionResult = useActionData<typeof action>() as { ok: boolean; error?: string } | undefined;
  const catalog = getMessages(locale, "admin").catalog;

  return (
    <>
      <h1 className="text-2xl font-bold">{catalog.title}</h1>
      <p className="opacity-70">{catalog.description}</p>
      <Form method="get" className="mt-4 flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={query}
          placeholder={catalog.searchPlaceholder}
          className="rounded border p-2"
        />
        <select name="category" defaultValue={category} className="rounded border p-2">
          <option value="">{catalog.allCategories}</option>
          {providerCategories.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.title} ({entry.count})
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" name="published" value="1" defaultChecked={publishedOnly} />
          {catalog.publishedFilter}
        </label>
        <button type="submit" className="rounded border px-3 py-1.5">
          {catalog.searchLabel}
        </button>
      </Form>
      {products.length === 0 ? (
        <p className="mt-6 opacity-70">{catalog.emptyDescription}</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-2">
          {products.map((product) => (
            <li key={product.id} className="flex items-center justify-between gap-2 rounded border p-2 text-sm">
              <span>
                <strong>{product.nameEn}</strong> <span className="opacity-60">{product.nameAr}</span> —{" "}
                {product.offerCount} offers — {product.isActive ? catalog.published : catalog.unpublished}
              </span>
              <Link to={`/${locale}/dashboard/catalog/${product.id}`} className="rounded border px-2 py-1">
                {catalog.editAction}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <h2 className="mt-8 text-lg font-bold">{catalog.create.formTitle}</h2>
      <Form method="post" className="mt-2 flex max-w-lg flex-col gap-2">
        <input name="nameAr" required maxLength={160} placeholder={catalog.game.nameAr} className="rounded border p-2" />
        <input name="nameEn" required maxLength={160} placeholder={catalog.game.nameEn} className="rounded border p-2" />
        <input name="slug" required maxLength={80} placeholder={catalog.game.slug} className="rounded border p-2" dir="ltr" />
        <select name="productKind" className="rounded border p-2">
          {PRODUCT_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {kind}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded border px-4 py-2 font-bold">
          {catalog.create.submitAction}
        </button>
        {actionResult && !actionResult.ok ? (
          <p role="alert" className="text-red-600">
            {catalog.errors[actionResult.error as keyof typeof catalog.errors] ?? actionResult.error}
          </p>
        ) : null}
      </Form>
    </>
  );
}
