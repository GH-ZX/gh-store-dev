import { data, redirect, Link, useLoaderData } from "react-router";
import type { Route } from "./+types/locale-wishlist";
import { isLocale, type Locale } from "@/i18n/config";
import { getCloudflareContext } from "@/lib/cloudflare-context";
import { buildPageMeta } from "@/lib/seo";
import { ProductGrid } from "@/components/store/collections";
import { getProductCardLabels } from "@/lib/catalog/labels";
import { getMessages } from "@/i18n/messages";
import { HeartIcon } from "@/components/ui/icons";
import {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  isProductWishlisted,
} from "@server/lib/services/wishlist.service";
import {
  createSessionClient,
  getSessionUserId,
  redirectToLogin,
  sessionCookieHeaders,
  withSessionCookies,
} from "@server/session";

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
      redirectToLogin(request, locale, `/${locale}/account/wishlist`),
      jar,
      isProduction,
    );
  }

  const products = await getWishlist(supabase, userId, locale);

  return data(
    { locale, products },
    { headers: sessionCookieHeaders(jar, isProduction) },
  );
}

export async function action({ params, request, context }: Route.ActionArgs) {
  const locale = params.locale ?? "";
  if (!isLocale(locale)) {
    return data({ ok: false, error: "invalid_locale" }, { status: 400 });
  }

  const { env } = getCloudflareContext(context);
  const { supabase, jar, isProduction } = createSessionClient(request, env);
  const userId = await getSessionUserId(supabase);

  if (!userId) {
    return data(
      { ok: false, error: "unauthenticated" },
      { status: 401, headers: sessionCookieHeaders(jar, isProduction) },
    );
  }

  const formData = await request.formData();
  const actionKind = formData.get("action") as string;
  const productId = (formData.get("productId") as string)?.trim();

  if (!productId) {
    return data(
      { ok: false, error: "missing_product" },
      { status: 400, headers: sessionCookieHeaders(jar, isProduction) },
    );
  }

  if (actionKind === "toggle") {
    const exists = await isProductWishlisted(supabase, userId, productId);
    if (exists) {
      await removeFromWishlist(supabase, userId, productId);
      return data({ ok: true, wishlisted: false }, { headers: sessionCookieHeaders(jar, isProduction) });
    } else {
      await addToWishlist(supabase, userId, productId);
      return data({ ok: true, wishlisted: true }, { headers: sessionCookieHeaders(jar, isProduction) });
    }
  }

  if (actionKind === "remove") {
    await removeFromWishlist(supabase, userId, productId);
    return data({ ok: true, wishlisted: false }, { headers: sessionCookieHeaders(jar, isProduction) });
  }

  if (actionKind === "add") {
    await addToWishlist(supabase, userId, productId);
    return data({ ok: true, wishlisted: true }, { headers: sessionCookieHeaders(jar, isProduction) });
  }

  return data(
    { ok: false, error: "unknown_action" },
    { status: 400, headers: sessionCookieHeaders(jar, isProduction) },
  );
}

export function meta({ params }: Route.MetaArgs) {
  const locale = params.locale && isLocale(params.locale) ? params.locale : "ar";
  return buildPageMeta({
    locale,
    path: "/account/wishlist",
    title: locale === "ar" ? "قائمة الرغبات" : "My Wishlist",
    description: locale === "ar" ? "المنتجات المحفوظة في قائمة رغباتك" : "Products saved in your wishlist",
    noIndex: true,
  });
}

export default function WishlistRoute() {
  const { locale, products } = useLoaderData<typeof loader>();
  const isAr = locale === "ar";
  const common = getMessages(locale, "common");
  const catalog = getMessages(locale, "catalog");
  const labels = getProductCardLabels(common, catalog);

  return (
    <div className="gh-page py-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--ink)]">
            {isAr ? "قائمة الرغبات" : "My Wishlist"}
          </h1>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            {isAr
              ? `لديك ${products.length} منتج محفوظ`
              : `You have ${products.length} saved item${products.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <Link
          to={`/${locale}/products`}
          className="text-sm font-medium text-[var(--accent)] hover:underline"
        >
          {isAr ? "تصفح المتجر" : "Browse catalog"}
        </Link>
      </header>

      {products.length === 0 ? (
        <div className="rounded-[var(--radius-card,18px)] border border-[var(--line)] bg-[var(--surface)] p-12 text-center">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-[var(--surface-strong)] text-[var(--ink-muted)]">
            <HeartIcon className="size-6 text-[var(--ink-muted)]" />
          </div>
          <h2 className="text-lg font-semibold text-[var(--ink)]">
            {isAr ? "قائمة الرغبات فارغة" : "Your wishlist is empty"}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-[var(--ink-muted)]">
            {isAr
              ? "استكشف المنتجات وأضف ما يعجبك إلى قائمة الرغبات للعودة إليه لاحقاً."
              : "Explore our catalog and save your favourite items here for easy access."}
          </p>
          <div className="mt-6">
            <Link
              to={`/${locale}/products`}
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-[var(--accent)] px-6 text-sm font-semibold text-[var(--accent-ink)] transition-transform active:scale-95"
            >
              {isAr ? "تصفح المنتجات" : "Browse products"}
            </Link>
          </div>
        </div>
      ) : (
        <ProductGrid
          games={products}
          locale={locale}
          labels={labels}
          className="grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
        />
      )}
    </div>
  );
}
