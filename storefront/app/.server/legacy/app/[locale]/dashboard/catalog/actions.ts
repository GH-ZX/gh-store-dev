

import { revalidatePath } from "@server/compat/cache";
import { redirect } from "@server/compat/navigation";
import { z } from "zod";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n/config";
import { requireAdmin } from "@server/lib/auth/guards";
import { createSupabaseServiceClient } from "@server/lib/supabase/service";
import { createSupabaseServerClient } from "@server/lib/supabase/server";
import { formFlag, formText, formTextList } from "@/lib/forms/form-data";
import {
  createAdminProduct,
  createAdminOffer,
  deleteAdminProduct,
  deleteAdminOffer,
  ProductNotFoundError,
  OfferNotFoundError,
  OfferSlugTakenError,
  PRICING_MODES,
  PRODUCT_KINDS,
  ProviderLinkInvalidError,
  setAdminProductProviderLink,
  SlugTakenError,
  updateAdminProduct,
  updateAdminOffers,
  type AdminOfferUpdate,
} from "@server/legacy/lib/services/admin-catalog.service";
import {
  INITIAL_CATALOG_STATE,
  INITIAL_IGDB_SEARCH_STATE,
  type CatalogActionState,
  type IgdbSearchState,
} from "@/app/[locale]/dashboard/catalog/action-state";
import { getIgdbCredentials } from "@server/legacy/lib/services/admin-settings.service";
import { IgdbClient } from "@server/providers/igdb/client";

/**
 * Catalog administration actions.
 *
 * Results are message keys, never prose, so the dashboard renders them in the
 * admin's language. Every field is read through the FormData helpers because
 * `FormData.get` yields `null` for an absent field while a schema's `.optional()`
 * only accepts `undefined` — the mismatch that once broke sign-in.
 *
 * A successful write revalidates the whole storefront layout as well as the
 * dashboard: a renamed or unpublished game changes cached customer pages, not
 * just this list.
 */

const MAX_OFFER_ROWS = 500;

/**
 * A slug reaches customers as a URL, so it stays letters, numbers, and dashes.
 *
 * Deliberately permissive about repeated and trailing dashes: an imported slug is
 * truncated to fit the column and can end on one, and refusing to save a game
 * until its generated slug is hand-cleaned would be a worse bug than an ugly URL.
 */
const SLUG_PATTERN = /^[\p{Letter}\p{Number}][\p{Letter}\p{Number}-]*$/u;

const optionalText = (max: number) => z.union([z.null(), z.string().trim().max(max)]);
const optionalNumber = (max: number) =>
  z.union([z.null(), z.coerce.number().int().min(0).max(max)]);

const gameSchema = z.object({
  gameId: z.uuid(),
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

const offersSchema = z.object({
  gameId: z.uuid(),
  rows: z.array(offerRowSchema).max(MAX_OFFER_ROWS),
});

const deleteSchema = z.object({ gameId: z.uuid() });

function resolveLocale(value: unknown): Locale {
  return typeof value === "string" && isLocale(value) ? value : DEFAULT_LOCALE;
}

/** Map a service failure onto a message key the form can localize. */
function errorKey(error: unknown): string {
  if (error instanceof SlugTakenError) {
    return "slug_taken";
  }

  if (error instanceof ProductNotFoundError) {
    return "not_found";
  }

  if (error instanceof OfferSlugTakenError) {
    return "offer_slug_taken";
  }

  if (error instanceof OfferNotFoundError) {
    return "offer_not_found";
  }

  if (error instanceof ProviderLinkInvalidError) {
    return "provider_link_invalid";
  }

  return "unknown";
}

function failed(error: string): CatalogActionState {
  return { ...INITIAL_CATALOG_STATE, error };
}

/** Invalidate the storefront and the dashboard views of one game. */
function revalidateCatalog(locale: Locale, gameId: string): void {
  revalidatePath("/", "layout");
  revalidatePath(`/${locale}/dashboard/catalog`);
  revalidatePath(`/${locale}/dashboard/catalog/${gameId}`);
}

export async function updateProductAction(
  _state: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  await requireAdmin();

  const parsed = gameSchema.safeParse({
    gameId: formText(formData, "gameId"),
    categoryId: formText(formData, "categoryId") ?? "",
    productKind: formText(formData, "productKind") ?? "other",
    nameAr: formText(formData, "nameAr"),
    nameEn: formText(formData, "nameEn"),
    slug: formText(formData, "slug"),
    pointsNameAr: formText(formData, "pointsNameAr") ?? null,
    pointsNameEn: formText(formData, "pointsNameEn") ?? null,
    descriptionAr: formText(formData, "descriptionAr") ?? null,
    descriptionEn: formText(formData, "descriptionEn") ?? null,
    imageUrl: formText(formData, "imageUrl") ?? null,
    logoUrl: formText(formData, "logoUrl") ?? null,
    carouselBadgeAr: formText(formData, "carouselBadgeAr") ?? null,
    carouselBadgeEn: formText(formData, "carouselBadgeEn") ?? null,
    sortOrder: formText(formData, "sortOrder") ?? "0",
    isActive: formFlag(formData, "isActive"),
    isFeatured: formFlag(formData, "isFeatured"),
    showInCarousel: formFlag(formData, "showInCarousel"),
    carouselOrder: formText(formData, "carouselOrder") ?? null,
    carouselLogoTone: formText(formData, "carouselLogoTone") ?? null,
    carouselColor: formText(formData, "carouselColor") ?? null,
  });

  if (!parsed.success) {
    return failed("invalid_input");
  }

  const locale = resolveLocale(formText(formData, "locale"));
  const { gameId, ...fields } = parsed.data;

  try {
    await updateAdminProduct(gameId, { ...fields, categoryId: fields.categoryId || null });
  } catch (error) {
    return failed(errorKey(error));
  }

  revalidateCatalog(locale, gameId);

  return { ...INITIAL_CATALOG_STATE, notice: "saved" };
}

export async function deleteProductAction(
  _state: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  await requireAdmin();

  const parsed = deleteSchema.safeParse({ gameId: formText(formData, "gameId") });

  if (!parsed.success) {
    return failed("invalid_input");
  }

  const locale = resolveLocale(formText(formData, "locale"));

  try {
    await deleteAdminProduct(parsed.data.gameId);
  } catch (error) {
    return failed(errorKey(error));
  }

  revalidateCatalog(locale, parsed.data.gameId);

  // The edited game no longer exists, so its page would 404: the list is the
  // only sensible place to land.
  redirect(`/${locale}/dashboard/catalog`);
}

export async function deleteProductDirectAction(input: {
  productId: string;
  locale?: string;
}): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  if (!input.productId || typeof input.productId !== "string") {
    return { ok: false, error: "invalid_input" };
  }
  try {
    await deleteAdminProduct(input.productId);
    const locale = resolveLocale(input.locale);
    revalidateCatalog(locale, input.productId);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "unknown" };
  }
}

export async function autoCompleteCatalogAction(input: { locale?: string } = {}): Promise<{
  ok: boolean;
  categoriesUpdated: number;
  artworkUpdated: number;
  offersCreated: number;
  error?: string;
}> {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const locale = resolveLocale(input.locale);

  try {
    const categoryMappings: Array<{ categoryId: string; slugs: string[] }> = [
      {
        categoryId: "79b2537a-e96a-4f23-9a92-7a2b5fd1640e", // AI
        slugs: [
          "admin-gemini-pro-drive-5tb-1-year-162", "api-100m-token-claude-3day-88", "api-100m-token-codex-3day-127",
          "api-10m-token-claude-1day-warranty-85", "api-50m-token-codex-2day-125", "api-claude-50m-token-2day-96",
          "brain-fm-1-year-174", "claude-100-api-30-d-warranty-101", "cursor-pro-12m-166", "descript-creator-1-year-175",
          "elevenlabs-elevenlabs-free-10k-credits-w24h-75", "elevenlabs-creator-12m-167", "gamma-ai-plus-1m-w25d-163",
          "gamma-pro-12m-123", "grok-super-grok-7-days-w5d-128", "lovable-pro-12m-171", "lovalbe-pro-lite-1-year-link-20",
          "manus-pro-1-year-non-warranty-177", "manus-pro-12m-114"
        ]
      },
      {
        categoryId: "f585218e-5392-4529-a31c-3b44f904619f", // Design
        slugs: [
          "adobe-express-premium-12-months-93", "capcut-6month-fw-individual-26", "capcut-pro-1-month-fw-18",
          "figma-pro-edu-2yrs-107", "framer-pro-1-year-178", "framer-pro-12m-122", "magic-patterns-starter-12m-170",
          "meitu-svip-meitu-svip-1m-w25d-153", "miro-edu-lifetime-access-100-members-151", "mobbin-10x-seat-12m-169",
          "slot-canva-pro-team-edu-invite-5month-warranty-29"
        ]
      },
      {
        categoryId: "b41de915-40c9-49de-9951-f7c694c5a911", // Productivity
        slugs: [
          "amboss-full-subscription-9-months-109", "autodesk-admin-dashboard-access-3000-invitation-150",
          "autodesk-education-plan-1-year-51", "cousera-bussiness-6m-ready-account-161", "duolingo-super-slot-12-months-156",
          "ilovepdf-premium-1yr-105", "jetbrains-edu-1-year-139", "key-windows-11-pro-retail-87", "key-windows-10-pro-retail-98",
          "linear-business-1-year-173", "microsoft-365-family-1-year-invitation-147", "microsoft-office-365-plus-1-year-35",
          "n8n-starter-12m-168", "notion-business-3-months-83", "notion-business-1-year-non-warranty-179",
          "quillbot-1-month-183", "quizlet-plus-12m-fw-137", "quizlet-plus-ultimate-12m-fw-138",
          "scribd-scribd-premium-1m-fw-134", "zoom-12-months-100-people-131", "zoom-3-months-100-people-130",
          "zoom-6-months-100-people-132", "zoom-zoom-pro-1m-w25d-ready-account-129"
        ]
      },
      {
        categoryId: "6cb6c5cd-76fe-447b-b456-94b1a30ff151", // Services
        slugs: [
          "1-mtn-14", "amazon-prime-6-months-video-6-profile-46", "amazon-prime-video-1-month-160",
          "apple-tv-official-subscriptions-12m-fw-145", "gmail-4-9-month-old-nw-60", "hma-key-hma-android-pc-20-30d-143",
          "admin-netflix-4k-premium-1m-5-profile-no-warranty-41", "nord-vpn", "peacock-official-subscriptions-1year-152",
          "proton-vpn-plus-1-month-10-devices-94", "railway-hobby-12m-182", "replit-core-12m-121",
          "shahid-vip-subscription-features-3-months-111", "spotify-3m-redeem-link-164"
        ]
      }
    ];

    let categoriesUpdated = 0;
    for (const mapping of categoryMappings) {
      const { data } = await supabase
        .from("products")
        .update({ category_id: mapping.categoryId, updated_at: new Date().toISOString() })
        .in("slug", mapping.slugs)
        .is("category_id", null)
        .select("id");
      categoriesUpdated += data?.length ?? 0;
    }

    const artworkMap: Record<string, string> = {
      "1-mtn-14": "https://www.google.com/s2/favicons?domain=mtn.com&sz=128",
      "admin-gemini-pro-drive-5tb-1-year-162": "https://cdn.jsdelivr.net/npm/simple-icons/icons/googlegemini.svg",
      "amazon-prime-6-months-video-6-profile-46": "https://cdn.jsdelivr.net/npm/simple-icons/icons/amazonprime.svg",
      "amazon-prime-video-1-month-160": "https://cdn.jsdelivr.net/npm/simple-icons/icons/amazonprime.svg",
      "api-100m-token-claude-3day-88": "https://cdn.jsdelivr.net/npm/simple-icons/icons/claude.svg",
      "api-10m-token-claude-1day-warranty-85": "https://cdn.jsdelivr.net/npm/simple-icons/icons/claude.svg",
      "api-claude-50m-token-2day-96": "https://cdn.jsdelivr.net/npm/simple-icons/icons/claude.svg",
      "claude-100-api-30-d-warranty-101": "https://cdn.jsdelivr.net/npm/simple-icons/icons/claude.svg",
      "api-100m-token-codex-3day-127": "https://cdn.jsdelivr.net/npm/simple-icons/icons/openai.svg",
      "api-50m-token-codex-2day-125": "https://cdn.jsdelivr.net/npm/simple-icons/icons/openai.svg",
      "apple-tv-official-subscriptions-12m-fw-145": "https://cdn.jsdelivr.net/npm/simple-icons/icons/appletv.svg",
      "autodesk-admin-dashboard-access-3000-invitation-150": "https://cdn.jsdelivr.net/npm/simple-icons/icons/autodesk.svg",
      "brain-fm-1-year-174": "https://www.google.com/s2/favicons?domain=brain.fm&sz=128",
      "cousera-bussiness-6m-ready-account-161": "https://cdn.jsdelivr.net/npm/simple-icons/icons/coursera.svg",
      "cursor-pro-12m-166": "https://cdn.jsdelivr.net/npm/simple-icons/icons/cursor.svg",
      "descript-creator-1-year-175": "https://www.google.com/s2/favicons?domain=descript.com&sz=128",
      "duolingo-super-slot-12-months-156": "https://cdn.jsdelivr.net/npm/simple-icons/icons/duolingo.svg",
      "elevenlabs-creator-12m-167": "https://cdn.jsdelivr.net/npm/simple-icons/icons/elevenlabs.svg",
      "expressvpn-private-5-devices-30d-27": "https://cdn.jsdelivr.net/npm/simple-icons/icons/expressvpn.svg",
      "framer-pro-1-year-178": "https://cdn.jsdelivr.net/npm/simple-icons/icons/framer.svg",
      "framer-pro-12m-122": "https://cdn.jsdelivr.net/npm/simple-icons/icons/framer.svg",
      "gamma-pro-12m-123": "https://www.google.com/s2/favicons?domain=gamma.app&sz=128",
      "ilovepdf-premium-1yr-105": "https://www.google.com/s2/favicons?domain=ilovepdf.com&sz=128",
      "jetbrains-edu-1-year-139": "https://cdn.jsdelivr.net/npm/simple-icons/icons/jetbrains.svg",
      "key-windows-10-pro-retail-98": "https://cdn.jsdelivr.net/npm/simple-icons/icons/windows10.svg",
      "linear-business-1-year-173": "https://cdn.jsdelivr.net/npm/simple-icons/icons/linear.svg",
      "lovable-pro-12m-171": "https://www.google.com/s2/favicons?domain=lovable.dev&sz=128",
      "magic-patterns-starter-12m-170": "https://www.google.com/s2/favicons?domain=magicpatterns.com&sz=128",
      "manus-pro-1-year-non-warranty-177": "https://www.google.com/s2/favicons?domain=manus.im&sz=128",
      "manus-pro-12m-114": "https://www.google.com/s2/favicons?domain=manus.im&sz=128",
      "microsoft-365-family-1-year-invitation-147": "https://cdn.jsdelivr.net/npm/simple-icons/icons/microsoftoffice.svg",
      "miro-edu-lifetime-access-100-members-151": "https://cdn.jsdelivr.net/npm/simple-icons/icons/miro.svg",
      "mobbin-10x-seat-12m-169": "https://www.google.com/s2/favicons?domain=mobbin.com&sz=128",
      "n8n-starter-12m-168": "https://cdn.jsdelivr.net/npm/simple-icons/icons/n8n.svg",
      "notion-business-1-year-non-warranty-179": "https://cdn.jsdelivr.net/npm/simple-icons/icons/notion.svg",
      "peacock-official-subscriptions-1year-152": "https://www.google.com/s2/favicons?domain=peacocktv.com&sz=128",
      "quillbot-1-month-183": "https://www.google.com/s2/favicons?domain=quillbot.com&sz=128",
      "quizlet-plus-12m-fw-137": "https://cdn.jsdelivr.net/npm/simple-icons/icons/quizlet.svg",
      "quizlet-plus-ultimate-12m-fw-138": "https://cdn.jsdelivr.net/npm/simple-icons/icons/quizlet.svg",
      "railway-hobby-12m-182": "https://cdn.jsdelivr.net/npm/simple-icons/icons/railway.svg",
      "replit-core-12m-121": "https://cdn.jsdelivr.net/npm/simple-icons/icons/replit.svg",
      "shahid-vip-subscription-features-3-months-111": "https://www.google.com/s2/favicons?domain=shahid.mbc.net&sz=128",
      "spotify-3m-redeem-link-164": "https://cdn.jsdelivr.net/npm/simple-icons/icons/spotify.svg"
    };

    let artworkUpdated = 0;
    for (const [slug, url] of Object.entries(artworkMap)) {
      const { data } = await supabase
        .from("products")
        .update({ image_url: url, updated_at: new Date().toISOString() })
        .eq("slug", slug)
        .or("image_url.is.null,image_url.eq.")
        .select("id");
      if (data && data.length > 0) artworkUpdated += data.length;
    }

    const missingOfferSlugs: Record<string, { price: number; deliveryKind: "account" | "direct" }> = {
      "adobe-express-premium-12-months-93": { price: 15.00, deliveryKind: "account" },
      "amazon-prime-6-months-video-6-profile-46": { price: 10.00, deliveryKind: "account" },
      "amazon-prime-video-1-month-160": { price: 5.00, deliveryKind: "account" },
      "api-100m-token-claude-3day-88": { price: 10.00, deliveryKind: "direct" },
      "api-50m-token-codex-2day-125": { price: 8.00, deliveryKind: "direct" },
      "autodesk-education-plan-1-year-51": { price: 12.00, deliveryKind: "account" },
      "capcut-pro-1-month-fw-18": { price: 5.00, deliveryKind: "account" },
      "gemini-18-months-16": { price: 20.00, deliveryKind: "account" },
      "gmail-4-9-month-old-nw-60": { price: 5.00, deliveryKind: "direct" },
      "key-windows-11-pro-retail-87": { price: 15.00, deliveryKind: "direct" },
      "lovalbe-pro-lite-1-year-link-20": { price: 12.00, deliveryKind: "account" },
      "microsoft-365-family-1-year-invitation-147": { price: 15.00, deliveryKind: "account" },
      "admin-netflix-4k-premium-1m-5-profile-no-warranty-41": { price: 5.00, deliveryKind: "account" },
      "nord-vpn": { price: 10.00, deliveryKind: "account" },
      "proton-vpn-plus-1-month-10-devices-94": { price: 6.00, deliveryKind: "account" }
    };

    let offersCreated = 0;
    const { data: missingProducts } = await supabase
      .from("products")
      .select("id, slug, name_ar, name_en")
      .in("slug", Object.keys(missingOfferSlugs));

    for (const prod of missingProducts ?? []) {
      const config = missingOfferSlugs[prod.slug];
      if (!config) continue;
      const offerSlug = `${prod.slug}-standard`;
      const { data: offerData, error } = await supabase.from("offers").upsert({
        product_id: prod.id,
        slug: offerSlug,
        name_ar: prod.name_ar,
        name_en: prod.name_en,
        offer_type: "digital",
        price: config.price,
        currency: "USD",
        is_active: true,
        delivery_kind: config.deliveryKind,
        updated_at: new Date().toISOString()
      }, { onConflict: "product_id,slug" }).select("id");
      if (!error && offerData?.length) offersCreated += offerData.length;
    }

    revalidatePath("/", "layout");
    revalidatePath(`/${locale}/dashboard`);
    revalidatePath(`/${locale}/dashboard/catalog`);

    return {
      ok: true,
      categoriesUpdated,
      artworkUpdated,
      offersCreated
    };
  } catch (error) {
    return {
      ok: false,
      categoriesUpdated: 0,
      artworkUpdated: 0,
      offersCreated: 0,
      error: error instanceof Error ? error.message : "unknown"
    };
  }
}

const providerLinkSchema = z.object({
  gameId: z.uuid(),
  url: z.union([z.literal(""), z.string().trim().max(2048)]),
});

/**
 * Save the supplier listing link shown beside a catalog entry.
 *
 * Kept separate from the game form on purpose: the link describes the
 * supplier's page rather than our product, so it edits the provider mapping
 * and survives game edits untouched.
 */
export async function saveProviderLinkAction(
  _state: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  await requireAdmin();

  const parsed = providerLinkSchema.safeParse({
    gameId: formText(formData, "gameId"),
    url: formText(formData, "providerUrl") ?? "",
  });

  if (!parsed.success) {
    return failed("invalid_input");
  }

  const locale = resolveLocale(formText(formData, "locale"));

  try {
    await setAdminProductProviderLink(parsed.data.gameId, parsed.data.url);
  } catch (error) {
    return failed(errorKey(error));
  }

  revalidateCatalog(locale, parsed.data.gameId);

  return { ...INITIAL_CATALOG_STATE, notice: "saved" };
}

export async function updateOffersAction(
  _state: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  await requireAdmin();

  // Row order comes from the hidden id list, so index `n` of the list owns the
  // `offers.n.*` fields.
  const ids = formTextList(formData, "offerIds").slice(0, MAX_OFFER_ROWS);
  const parsed = offersSchema.safeParse({
    gameId: formText(formData, "gameId"),
    rows: ids.map((id, index) => ({
      id,
      nameAr: formText(formData, `offers.${index}.nameAr`),
      nameEn: formText(formData, `offers.${index}.nameEn`),
      descriptionAr: formText(formData, `offers.${index}.descriptionAr`) ?? null,
      descriptionEn: formText(formData, `offers.${index}.descriptionEn`) ?? null,
      price: formText(formData, `offers.${index}.price`),
      originalPrice: formText(formData, `offers.${index}.originalPrice`) ?? null,
      isSale: formFlag(formData, `offers.${index}.isSale`),
      isActive: formFlag(formData, `offers.${index}.isActive`),
      sortOrder: formText(formData, `offers.${index}.sortOrder`) ?? "0",
      pricingMode: formText(formData, `offers.${index}.pricingMode`),
    })),
  });

  if (!parsed.success) {
    return failed("invalid_input");
  }

  const locale = resolveLocale(formText(formData, "locale"));
  const rows: AdminOfferUpdate[] = parsed.data.rows;

  try {
    await updateAdminOffers(parsed.data.gameId, rows);
  } catch (error) {
    return failed(errorKey(error));
  }

  revalidateCatalog(locale, parsed.data.gameId);

  return { ...INITIAL_CATALOG_STATE, notice: "saved" };
}

/**
 * Create a game, then hand over to the editor that already exists.
 *
 * Three fields here and everything else there. A create form that asked for
 * artwork, descriptions, and carousel flags would be a second copy of the edit
 * form, and the second copy is the one that falls behind.
 */
const createGameSchema = z.object({
  nameAr: z.string().trim().min(1).max(160),
  nameEn: z.string().trim().min(1).max(160),
  slug: z.string().trim().min(1).max(80).regex(SLUG_PATTERN),
});

export async function createProductAction(
  _state: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  await requireAdmin();

  const parsed = createGameSchema.safeParse({
    nameAr: formText(formData, "nameAr"),
    nameEn: formText(formData, "nameEn"),
    slug: formText(formData, "slug"),
  });

  if (!parsed.success) {
    return failed("invalid_input");
  }

  const locale = resolveLocale(formText(formData, "locale"));
  let gameId: string;

  try {
    gameId = await createAdminProduct({ ...parsed.data, productKind: "other" });
  } catch (error) {
    return failed(errorKey(error));
  }

  revalidateCatalog(locale, gameId);

  // `redirect` throws, so nothing below it runs and the state above is never
  // returned on success — the new game's editor is the answer.
  redirect(`/${locale}/dashboard/catalog/${gameId}`);
}

const createOfferSchema = z.object({
  gameId: z.uuid(),
  nameAr: z.string().trim().min(1).max(160),
  nameEn: z.string().trim().min(1).max(160),
  descriptionAr: optionalText(4000),
  descriptionEn: optionalText(4000),
  slug: z.string().trim().min(1).max(80).regex(SLUG_PATTERN),
  price: z.coerce.number().min(0).max(100_000),
  offerType: z.enum(["topup", "gift_card", "redeem_code"]),
});

export async function createOfferAction(
  _state: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  await requireAdmin();

  const parsed = createOfferSchema.safeParse({
    gameId: formText(formData, "gameId"),
    nameAr: formText(formData, "nameAr"),
    nameEn: formText(formData, "nameEn"),
    descriptionAr: formText(formData, "descriptionAr") ?? null,
    descriptionEn: formText(formData, "descriptionEn") ?? null,
    slug: formText(formData, "slug"),
    price: formText(formData, "price"),
    offerType: formText(formData, "offerType"),
  });

  if (!parsed.success) {
    return failed("invalid_input");
  }

  const locale = resolveLocale(formText(formData, "locale"));
  const { gameId, ...fields } = parsed.data;

  try {
    await createAdminOffer(gameId, fields);
  } catch (error) {
    return failed(errorKey(error));
  }

  revalidateCatalog(locale, gameId);

  return { ...INITIAL_CATALOG_STATE, notice: "offer_added" };
}

const deleteOfferSchema = z.object({ gameId: z.uuid(), offerId: z.uuid() });

export async function deleteOfferAction(
  _state: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  await requireAdmin();

  const parsed = deleteOfferSchema.safeParse({
    gameId: formText(formData, "gameId"),
    offerId: formText(formData, "offerId"),
  });

  if (!parsed.success) {
    return failed("invalid_input");
  }

  const locale = resolveLocale(formText(formData, "locale"));

  try {
    await deleteAdminOffer(parsed.data.gameId, parsed.data.offerId);
  } catch (error) {
    return failed(errorKey(error));
  }

  revalidateCatalog(locale, parsed.data.gameId);

  return { ...INITIAL_CATALOG_STATE, notice: "offer_removed" };
}

/**
 * Search IGDB for artwork, from inside the game editor.
 *
 * The picker holds no state of its own beyond this result list — choosing an
 * image only fills the editor's URL fields, and nothing is saved until the
 * admin saves the game itself. That keeps one write path for catalog changes.
 */
export async function searchIgdbArtworkAction(
  _state: IgdbSearchState,
  formData: FormData,
): Promise<IgdbSearchState> {
  await requireAdmin();

  const query = formText(formData, "query") ?? "";

  if (query.trim().length === 0) {
    return { ...INITIAL_IGDB_SEARCH_STATE, error: "empty_query" };
  }

  const { clientId, clientSecret } = await getIgdbCredentials();

  if (!clientId || !clientSecret) {
    return { ...INITIAL_IGDB_SEARCH_STATE, query, error: "not_configured" };
  }

  try {
    const results = await new IgdbClient({ clientId, clientSecret }).searchGames(query);

    return { error: null, query, results };
  } catch {
    // The provider panels name the exact failure; the picker only needs to say
    // that looking failed and why the owner might care (credentials first).
    return { ...INITIAL_IGDB_SEARCH_STATE, query, error: "search_failed" };
  }
}

/* ------------------------------------------------------------------ */
/*  Stock management for stored products                              */
/* ------------------------------------------------------------------ */

import {
  addStockItem,
  bulkAddStockItems,
  deleteStockItem,
} from "@server/lib/services/stock.service";

type StockActionResult =
  | { error: string }
  | { item: { id: string; content: string; createdAt: string } }
  | { count: number }
  | { success: boolean };

export async function addStockItemAction(
  gameId: string,
  offerId: string,
  content: string,
): Promise<StockActionResult> {
  await requireAdmin();

  try {
    const item = await addStockItem(
      createSupabaseServiceClient(),
      offerId,
      content,
    );
    revalidatePath("/", "layout");
    return {
      item: { id: item.id, content: item.content, createdAt: item.createdAt },
    };
  } catch {
    return { error: "Failed to add stock item" };
  }
}

export async function bulkAddStockItemsAction(
  gameId: string,
  offerId: string,
  contents: string[],
): Promise<StockActionResult> {
  await requireAdmin();

  try {
    const count = await bulkAddStockItems(
      createSupabaseServiceClient(),
      offerId,
      contents,
    );
    revalidatePath("/", "layout");
    return { count };
  } catch {
    return { error: "Failed to bulk add stock items" };
  }
}

export async function deleteStockItemAction(
  gameId: string,
  offerId: string,
  stockItemId: string,
): Promise<StockActionResult> {
  await requireAdmin();

  try {
    const success = await deleteStockItem(
      createSupabaseServiceClient(),
      stockItemId,
    );
    revalidatePath("/", "layout");
    return { success };
  } catch {
    return { error: "Failed to delete stock item" };
  }
}

/**
 * Swap carousel_order between two games.
 *
 * Both games must already have `show_in_carousel = true`. The action swaps
 * their `carousel_order` values so the customer-facing carousel reflects
 * the new arrangement immediately after revalidation.
 */
export async function reorderCarouselProducts(
  gameAId: string,
  gameBId: string,
): Promise<{ success?: boolean; error?: string }> {
  await requireAdmin();

  const supabase = createSupabaseServiceClient();

  const { data: games, error: fetchError } = await supabase
    .from("products")
    .select("id, carousel_order")
    .in("id", [gameAId, gameBId]);

  if (fetchError || !games || games.length !== 2) {
    return { error: "Failed to fetch games" };
  }

  const gameA = games.find((g) => g.id === gameAId)!;
  const gameB = games.find((g) => g.id === gameBId)!;

  // Update each game individually to avoid upsert requiring all required fields
  const [updateA, updateB] = await Promise.all([
    supabase
      .from("products")
      .update({ carousel_order: gameB.carousel_order })
      .eq("id", gameAId),
    supabase
      .from("products")
      .update({ carousel_order: gameA.carousel_order })
      .eq("id", gameBId),
  ]);

  if (updateA.error || updateB.error) {
    return { error: "Failed to update carousel order" };
  }

  revalidatePath("/", "layout");
  return { success: true };
}
