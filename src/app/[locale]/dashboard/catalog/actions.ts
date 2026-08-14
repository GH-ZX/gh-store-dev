"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n/config";
import { requireAdmin } from "@/lib/auth/guards";
import { formFlag, formText, formTextList } from "@/lib/forms/form-data";
import {
  createAdminGame,
  createAdminOffer,
  deleteAdminGame,
  deleteAdminOffer,
  GameNotFoundError,
  OfferNotFoundError,
  OfferSlugTakenError,
  PRICING_MODES,
  SlugTakenError,
  updateAdminGame,
  updateAdminOffers,
  type AdminOfferUpdate,
} from "@/lib/services/admin-catalog.service";
import {
  INITIAL_CATALOG_STATE,
  type CatalogActionState,
} from "@/app/[locale]/dashboard/catalog/action-state";

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
});

const offerRowSchema = z.object({
  id: z.uuid(),
  nameAr: z.string().trim().min(1).max(160),
  nameEn: z.string().trim().min(1).max(160),
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

  if (error instanceof GameNotFoundError) {
    return "not_found";
  }

  if (error instanceof OfferSlugTakenError) {
    return "offer_slug_taken";
  }

  if (error instanceof OfferNotFoundError) {
    return "offer_not_found";
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

export async function updateGameAction(
  _state: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  await requireAdmin();

  const parsed = gameSchema.safeParse({
    gameId: formText(formData, "gameId"),
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
  });

  if (!parsed.success) {
    return failed("invalid_input");
  }

  const locale = resolveLocale(formText(formData, "locale"));
  const { gameId, ...fields } = parsed.data;

  try {
    await updateAdminGame(gameId, fields);
  } catch (error) {
    return failed(errorKey(error));
  }

  revalidateCatalog(locale, gameId);

  return { ...INITIAL_CATALOG_STATE, notice: "saved" };
}

export async function deleteGameAction(
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
    await deleteAdminGame(parsed.data.gameId);
  } catch (error) {
    return failed(errorKey(error));
  }

  revalidateCatalog(locale, parsed.data.gameId);

  // The edited game no longer exists, so its page would 404: the list is the
  // only sensible place to land.
  redirect(`/${locale}/dashboard/catalog`);
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

export async function createGameAction(
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
    gameId = await createAdminGame(parsed.data);
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
