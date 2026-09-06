import { data, Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import { z } from "zod";
import { isLocale } from "@/i18n/config";
import { formatMessage, getMessages } from "@/i18n/messages";
import { getCloudflareContext } from "@/lib/cloudflare-context";
import { buildPageMeta } from "@/lib/seo";
import {
  createAdminOffer,
  deleteAdminOffer,
  deleteAdminProduct,
  getAdminProduct,
  listAdminCategories,
  OfferNotFoundError,
  OfferSlugTakenError,
  ProductNotFoundError,
  ProviderLinkInvalidError,
  setAdminProductProviderLink,
  SlugTakenError,
  updateAdminOffers,
  updateAdminProduct,
  type AdminCategory,
  type AdminOfferUpdate,
  type AdminProductDetail,
} from "@server/lib/services/admin-catalog.service";
import { getSessionSummary } from "@server/lib/services/session.service";
import { addStockItem, deleteStockItem, getStockSummaries } from "@server/lib/services/stock.service";
import { PRICING_MODES, PRODUCT_KINDS } from "@/lib/product-kind";
import { createServiceClient, createSessionClient, getSessionUserId, redirectToLogin, sessionCookieHeaders, withSessionCookies } from "@server/session";
import type { Route } from "./+types/dashboard-product";

const SLUG_PATTERN = /^[\p{Letter}\p{Number}][\p{Letter}\p{Number}-]*$/u;
const optionalText = (max: number) => z.union([z.null(), z.string().trim().max(max)]);
const optionalNumber = (max: number) => z.union([z.null(), z.coerce.number().int().min(0).max(max)]);

const gameSchema = z.object({
  categoryId: z.union([z.literal(""), z.uuid()]),
  productKind: z.enum(PRODUCT_KINDS),
  nameAr: z.string().trim().min(1).max(160),
  nameEn: z.string().trim().min(1).max(160),
  slug: z.string().trim().min(1).max(80).regex(SLUG_PATTERN),
  pointsNameAr: optionalText(80),
  pointsNameEn: optionalText(80),
  descriptionAr: optionalText(4000),
  descriptionEn: optionalText(4000),
  imageUrl: optionalText(600),
  logoUrl: optionalText(600),
  carouselBadgeAr: optionalText(80),
  carouselBadgeEn: optionalText(80),
  sortOrder: z.coerce.number().int().min(0).max(100000),
  isActive: z.boolean(),
  isFeatured: z.boolean(),
  showInCarousel: z.boolean(),
  carouselOrder: optionalNumber(100000),
  carouselLogoTone: z.union([z.null(), z.literal("light"), z.literal("dark")]),
  carouselColor: optionalText(9),
});

const offerRowSchema = z.object({
  id: z.uuid(),
  nameAr: z.string().trim().min(1).max(160),
  nameEn: z.string().trim().min(1).max(160),
  descriptionAr: optionalText(4000),
  descriptionEn: optionalText(4000),
  price: z.coerce.number().min(0).max(1000000),
  originalPrice: z.union([z.null(), z.coerce.number().min(0).max(1000000)]),
  isSale: z.boolean(),
  isActive: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(100000),
  pricingMode: z.enum(PRICING_MODES),
});

function text(form: FormData, name: string): string | null {
  const value = form.get(name);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function flag(form: FormData, name: string): boolean {
  return form.get(name) === "on" || form.get(name) === "true" || form.get(name) === "1";
}

function errorKey(error: unknown): string {
  if (error instanceof SlugTakenError) return "slug_taken";
  if (error instanceof ProductNotFoundError) return "not_found";
  if (error instanceof OfferSlugTakenError) return "offer_slug_taken";
  if (error instanceof OfferNotFoundError) return "offer_not_found";
  if (error instanceof ProviderLinkInvalidError) return "provider_link_invalid";
  return "unknown";
}

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const locale = params.locale ?? "";
  const productId = params.productId ?? "";
  if (!isLocale(locale)) {
    throw new Response("Not Found", { status: 404 });
  }
  const { env } = getCloudflareContext(context);
  const { supabase, jar, isProduction } = createSessionClient(request, env);
  const userId = await getSessionUserId(supabase);
  if (!userId) {
    return withSessionCookies(
      redirectToLogin(request, locale, `/${locale}/dashboard/catalog/${productId}`),
      jar,
      isProduction,
    );
  }
  const session = await getSessionSummary(supabase, userId);
  if (!session?.isAdmin) {
    throw new Response("Forbidden", { status: 403 });
  }
  const [detail, categories] = await Promise.all([
    getAdminProduct(supabase, true, productId),
    listAdminCategories(supabase, true),
  ]);
  if (!detail) {
    throw new Response("Not Found", { status: 404 });
  }
  const service = createServiceClient(env);
  const storedOffers = detail.offers.filter((offer) => offer.deliveryKind === "stored");
  const stockCounts: Record<string, { available: number; sold: number; total: number }> = {};
  if (service && storedOffers.length > 0) {
    const summaries = await getStockSummaries(
      service,
      storedOffers.map((offer) => offer.id),
    );
    for (const [offerId, summary] of summaries) {
      stockCounts[offerId] = summary;
    }
  }
  return data(
    { locale, productId, detail, categories, stockCounts },
    { headers: sessionCookieHeaders(jar, isProduction) },
  );
}

export async function action({ params, request, context }: Route.ActionArgs) {
  const locale = params.locale ?? "";
  const productId = params.productId ?? "";
  if (!isLocale(locale)) {
    throw new Response("Not Found", { status: 404 });
  }
  const { env } = getCloudflareContext(context);
  const { supabase, jar, isProduction } = createSessionClient(request, env);
  const userId = await getSessionUserId(supabase);
  if (!userId) {
    return withSessionCookies(
      redirectToLogin(request, locale, `/${locale}/dashboard/catalog/${productId}`),
      jar,
      isProduction,
    );
  }
  const session = await getSessionSummary(supabase, userId);
  if (!session?.isAdmin) {
    throw new Response("Forbidden", { status: 403 });
  }
  const headers = sessionCookieHeaders(jar, isProduction);
  const service = createServiceClient(env);
  const form = await request.formData();
  const intent = form.get("intent");

  try {
    if (intent === "save-product") {
      const parsed = gameSchema.safeParse({
        categoryId: form.get("categoryId") ?? "",
        productKind: form.get("productKind"),
        nameAr: form.get("nameAr"),
        nameEn: form.get("nameEn"),
        slug: form.get("slug"),
        pointsNameAr: text(form, "pointsNameAr"),
        pointsNameEn: text(form, "pointsNameEn"),
        descriptionAr: text(form, "descriptionAr"),
        descriptionEn: text(form, "descriptionEn"),
        imageUrl: text(form, "imageUrl"),
        logoUrl: text(form, "logoUrl"),
        carouselBadgeAr: text(form, "carouselBadgeAr"),
        carouselBadgeEn: text(form, "carouselBadgeEn"),
        sortOrder: form.get("sortOrder"),
        isActive: flag(form, "isActive"),
        isFeatured: flag(form, "isFeatured"),
        showInCarousel: flag(form, "showInCarousel"),
        carouselOrder: text(form, "carouselOrder"),
        carouselLogoTone: text(form, "carouselLogoTone"),
        carouselColor: text(form, "carouselColor"),
      });
      if (!parsed.success) {
        return data({ ok: false as const, error: "invalid_input" }, { status: 400, headers });
      }
      await updateAdminProduct(supabase, true, productId, {
        ...parsed.data,
        categoryId: parsed.data.categoryId === "" ? null : parsed.data.categoryId,
      });
      return data({ ok: true as const, saved: "product" }, { headers });
    }

    if (intent === "save-offers") {
      const raw = JSON.parse(String(form.get("rows") ?? "[]")) as unknown[];
      const parsed = z.array(offerRowSchema).max(500).safeParse(raw);
      if (!parsed.success) {
        return data({ ok: false as const, error: "invalid_input" }, { status: 400, headers });
      }
      await updateAdminOffers(supabase, true, productId, parsed.data as AdminOfferUpdate[]);
      return data({ ok: true as const, saved: "offers" }, { headers });
    }

    if (intent === "save-link") {
      await setAdminProductProviderLink(
        supabase,
        service,
        { id: userId, isAdmin: true },
        productId,
        String(form.get("url") ?? ""),
      );
      return data({ ok: true as const, saved: "link" }, { headers });
    }

    if (intent === "delete-product") {
      await deleteAdminProduct(supabase, service, { id: userId, isAdmin: true }, productId);
      return withSessionCookies(redirect(`/${locale}/dashboard/catalog`), jar, isProduction);
    }

    if (intent === "add-offer") {
      const parsed = z
        .object({
          nameAr: z.string().trim().min(1).max(160),
          nameEn: z.string().trim().min(1).max(160),
          slug: z.string().trim().min(1).max(80).regex(SLUG_PATTERN),
          price: z.coerce.number().min(0).max(1000000),
          offerType: z.string().trim().min(1).max(60),
        })
        .safeParse({
          nameAr: form.get("nameAr"),
          nameEn: form.get("nameEn"),
          slug: form.get("slug"),
          price: form.get("price"),
          offerType: form.get("offerType"),
        });
      if (!parsed.success) {
        return data({ ok: false as const, error: "invalid_input" }, { status: 400, headers });
      }
      await createAdminOffer(supabase, true, productId, {
        ...parsed.data,
        descriptionAr: text(form, "descriptionAr"),
        descriptionEn: text(form, "descriptionEn"),
      });
      return data({ ok: true as const, saved: "offer" }, { headers });
    }

    if (intent === "delete-offer") {
      const offerId = String(form.get("offerId") ?? "");
      await deleteAdminOffer(supabase, true, productId, offerId);
      return data({ ok: true as const, saved: "offer-deleted" }, { headers });
    }

    if (intent === "add-stock") {
      if (!service) {
        return data({ ok: false as const, error: "unknown" }, { status: 503, headers });
      }
      const offerId = String(form.get("offerId") ?? "");
      const content = String(form.get("content") ?? "").trim();
      if (!offerId || !content) {
        return data({ ok: false as const, error: "invalid_input" }, { status: 400, headers });
      }
      await addStockItem(service, offerId, content);
      return data({ ok: true as const, saved: "stock" }, { headers });
    }

    if (intent === "delete-stock") {
      if (!service) {
        return data({ ok: false as const, error: "unknown" }, { status: 503, headers });
      }
      await deleteStockItem(service, String(form.get("itemId") ?? ""));
      return data({ ok: true as const, saved: "stock-deleted" }, { headers });
    }

    return data({ ok: false as const, error: "invalid_input" }, { status: 400, headers });
  } catch (error) {
    return data({ ok: false as const, error: errorKey(error) }, { status: 400, headers });
  }
}

export function meta({ params }: Route.MetaArgs) {
  const locale = params.locale && isLocale(params.locale) ? params.locale : "ar";
  return buildPageMeta({ locale, path: "/dashboard/catalog", title: "Edit product", description: "", noIndex: true });
}

export default function DashboardProduct() {
  const { locale, productId, detail, categories, stockCounts } = useLoaderData<typeof loader>() as unknown as {
    locale: "ar" | "en";
    productId: string;
    detail: AdminProductDetail;
    categories: AdminCategory[];
    stockCounts: Record<string, { available: number; sold: number; total: number }>;
  };
  const actionResult = useActionData<typeof action>() as { ok: boolean; error?: string; saved?: string } | undefined;
  const catalog = getMessages(locale, "admin").catalog;
  const { game, offers } = detail;

  return (
    <>
      <Link to={`/${locale}/dashboard/catalog`}>← {catalog.backToCatalog}</Link>
      <h1 className="mt-2 text-2xl font-bold">{game.nameAr}</h1>
      <p className="opacity-70">
        {game.nameEn} — {formatMessage(catalog.offersCount, { count: offers.length }, locale)}
      </p>
      {actionResult && !actionResult.ok ? (
        <p role="alert" className="mt-2 text-red-600">
          {catalog.errors[actionResult.error as keyof typeof catalog.errors] ?? actionResult.error}
        </p>
      ) : null}
      {actionResult?.ok ? <p className="mt-2 text-green-700">{catalog.game.saved}</p> : null}

      <h2 className="mt-6 text-lg font-bold">{catalog.game.title}</h2>
      <Form method="post" className="mt-2 grid max-w-2xl gap-2">
        <input type="hidden" name="intent" value="save-product" />
        <label className="grid gap-1 text-sm">
          {catalog.game.nameAr}
          <input name="nameAr" defaultValue={game.nameAr} required maxLength={160} className="rounded border p-2" />
        </label>
        <label className="grid gap-1 text-sm">
          {catalog.game.nameEn}
          <input name="nameEn" defaultValue={game.nameEn} required maxLength={160} className="rounded border p-2" />
        </label>
        <label className="grid gap-1 text-sm">
          {catalog.game.slug}
          <input name="slug" defaultValue={game.slug} required maxLength={80} dir="ltr" className="rounded border p-2" />
        </label>
        <label className="grid gap-1 text-sm">
          {catalog.game.categoryLabel}
          <select name="categoryId" defaultValue={game.categoryId ?? ""} className="rounded border p-2">
            <option value="">{catalog.game.categoryNone}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {locale === "ar" ? category.nameAr : category.nameEn}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          {catalog.game.productKindLabel}
          <select name="productKind" defaultValue={game.productKind} className="rounded border p-2">
            {PRODUCT_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          {catalog.game.descriptionAr}
          <textarea name="descriptionAr" defaultValue={game.descriptionAr ?? ""} rows={3} className="rounded border p-2" />
        </label>
        <label className="grid gap-1 text-sm">
          {catalog.game.descriptionEn}
          <textarea name="descriptionEn" defaultValue={game.descriptionEn ?? ""} rows={3} className="rounded border p-2" />
        </label>
        <label className="grid gap-1 text-sm">
          {catalog.game.imageUrl}
          <input name="imageUrl" defaultValue={game.imageUrl ?? ""} dir="ltr" className="rounded border p-2" />
        </label>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-1">
            <input type="checkbox" name="isActive" defaultChecked={game.isActive} /> {catalog.published}
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" name="isFeatured" defaultChecked={game.isFeatured} /> {catalog.featured}
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" name="showInCarousel" defaultChecked={game.showInCarousel} /> {catalog.inCarousel}
          </label>
        </div>
        <button type="submit" className="rounded border px-4 py-2 font-bold">
          {catalog.game.saveAction}
        </button>
      </Form>

      <h2 className="mt-8 text-lg font-bold">{catalog.offers.title}</h2>
      {offers.length === 0 ? (
        <p className="opacity-70">{catalog.offers.emptyDescription}</p>
      ) : (
        <ul className="mt-2 flex max-w-3xl flex-col gap-2">
          {offers.map((offer) => (
            <li key={offer.id} className="rounded border p-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span>
                  <strong>{offer.nameEn}</strong> — {offer.price} {offer.currency}
                  {offer.isActive ? "" : ` (${catalog.unpublished})`}
                  {offer.deliveryKind === "stored" && stockCounts[offer.id]
                    ? ` — stock: ${stockCounts[offer.id].available}/${stockCounts[offer.id].total}`
                    : null}
                </span>
                <Form method="post" onSubmit={(event) => { if (!confirm(catalog.manageOffers.removeConfirmAction)) event.preventDefault(); }}>
                  <input type="hidden" name="intent" value="delete-offer" />
                  <input type="hidden" name="offerId" value={offer.id} />
                  <button type="submit" className="rounded border px-2 py-1">
                    {catalog.manageOffers.removeAction}
                  </button>
                </Form>
              </div>
            </li>
          ))}
        </ul>
      )}

      <h3 className="mt-6 font-bold">{catalog.manageOffers.title}</h3>
      <Form method="post" className="mt-2 grid max-w-lg gap-2">
        <input type="hidden" name="intent" value="add-offer" />
        <input name="nameAr" required maxLength={160} placeholder={catalog.manageOffers.nameArLabel} className="rounded border p-2" />
        <input name="nameEn" required maxLength={160} placeholder={catalog.manageOffers.nameEnLabel} className="rounded border p-2" />
        <input name="slug" required maxLength={80} placeholder={catalog.manageOffers.slugLabel} dir="ltr" className="rounded border p-2" />
        <input name="price" required type="number" min="0" step="any" placeholder={catalog.manageOffers.priceLabel} className="rounded border p-2" />
        <input name="offerType" required maxLength={60} placeholder={catalog.manageOffers.typeLabel} className="rounded border p-2" />
        <button type="submit" className="rounded border px-4 py-2 font-bold">
          {catalog.manageOffers.addAction}
        </button>
      </Form>

      <h2 className="mt-8 text-lg font-bold">{catalog.supplierLinkTitle}</h2>
      <p className="text-sm opacity-70">{catalog.supplierLinkDescription}</p>
      <Form method="post" className="mt-2 flex max-w-lg gap-2">
        <input type="hidden" name="intent" value="save-link" />
        <input name="url" defaultValue={game.providerUrl ?? ""} dir="ltr" placeholder={catalog.supplierLinkLabel} className="flex-1 rounded border p-2" />
        <button type="submit" className="rounded border px-4 py-2">
          {catalog.supplierLinkSave}
        </button>
      </Form>

      <h2 className="mt-8 text-lg font-bold">{catalog.game.deleteAction}</h2>
      <Form
        method="post"
        onSubmit={(event) => { if (!confirm(catalog.game.deleteConfirm)) event.preventDefault(); }}
        className="mt-2"
      >
        <input type="hidden" name="intent" value="delete-product" />
        <button type="submit" className="rounded border border-red-600 px-4 py-2 text-red-600">
          {catalog.game.deleteAction}
        </button>
      </Form>
      <p className="mt-8 text-xs opacity-0">{productId}</p>
    </>
  );
}
