import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth/guards";
import { toSearchTokens } from "@/lib/catalog/search";
import { recordAudit } from "@/lib/services/admin-audit.service";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { G2BULK_PROVIDER_NAME } from "@/providers/g2bulk/mapping";
import { MAXSTORE_PROVIDER_NAME } from "@/providers/maxstore/mapping";
import type { Database } from "@/types/database";

/**
 * Admin reads and writes of the catalog.
 *
 * Every function runs behind {@link requireAdmin} and uses the caller's own
 * session, so the database's admin policy is the real gate. Supplier cost and
 * pricing mode are read here because an operator prices against them, but they
 * never travel to a storefront page — only to the dashboard.
 *
 * Writes are deliberately narrow: an update touches the columns an admin edits
 * and nothing else, so a later provider import still owns supplier cost and
 * availability.
 */

type Client = SupabaseClient<Database>;

/** Raised when a slug an admin typed already belongs to another game. */
export class SlugTakenError extends Error {
  constructor() {
    super("That slug already belongs to another game.");
    this.name = "SlugTakenError";
  }
}

/** Raised when the edited game disappeared between loading the form and saving it. */
export class ProductNotFoundError extends Error {
  constructor() {
    super("That game no longer exists.");
    this.name = "ProductNotFoundError";
  }
}

/** Postgres `unique_violation`: the slug lost a race with a concurrent rename. */
const UNIQUE_VIOLATION = "23505";

/**
 * A non-uuid id is treated as "no such game" rather than passed to Postgres,
 * which would reject it as malformed input and surface as a 500 instead of a 404.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const PRICING_MODES = ["default", "custom", "fixed"] as const;

export type PricingMode = (typeof PRICING_MODES)[number];

export function toPricingMode(value: string | null | undefined): PricingMode {
  return PRICING_MODES.includes(value as PricingMode) ? (value as PricingMode) : "default";
}

export const LOGO_TONES = ["light", "dark"] as const;

export type LogoTone = (typeof LOGO_TONES)[number];

export function toLogoTone(value: string | null | undefined): LogoTone | null {
  return LOGO_TONES.includes(value as LogoTone) ? (value as LogoTone) : null;
}

export type AdminProductListItem = {
  id: string;
  slug: string;
  nameAr: string;
  nameEn: string;
  imageUrl: string | null;
  isActive: boolean;
  isFeatured: boolean;
  showInCarousel: boolean;
  sortOrder: number;
  offerCount: number;
  providerName: string | null;
  providerCode: string | null;
  providerUrl: string | null;
  providerCategoryId: string | null;
  providerCategoryTitle: string | null;
};

export type AdminProviderCategory = {
  id: string;
  title: string;
  count: number;
};

const LIST_COLUMNS =
  "id, slug, name_ar, name_en, image_url, is_active, is_featured, show_in_carousel, sort_order";

const GAME_SEARCH_COLUMNS = ["name_ar", "name_en", "slug"];

function orIlike(columns: string[], token: string): string {
  return columns.map((column) => `${column}.ilike.%${token}%`).join(",");
}

/**
 * Offer totals per game.
 *
 * A plain id read tallied in memory rather than one count query per game: the
 * dashboard list needs every total at once, and a single round trip keeps the
 * page fast as the catalog grows.
 */
async function countOffersByProduct(client: Client, gameIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();

  if (gameIds.length === 0) {
    return counts;
  }

  const { data, error } = await client.from("offers").select("product_id").in("product_id", gameIds);

  if (error) {
    throw new Error(`Counting offers failed: ${error.message}`);
  }

  for (const row of data) {
    // Offers without a product do not contribute to a product's total.
    if (!row.product_id) {
      continue;
    }

    counts.set(row.product_id, (counts.get(row.product_id) ?? 0) + 1);
  }

  return counts;
}

type ProviderGameInfo = {
  providerName: string;
  providerCode: string;
  categoryId: string | null;
  categoryTitle: string | null;
  externalUrl: string | null;
};

function textMetadata(metadata: unknown, key: string): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const value = (metadata as Record<string, unknown>)[key];

  return (typeof value === "string" || typeof value === "number") && String(value).trim()
    ? String(value).trim()
    : null;
}

async function providerInfoByProduct(client: Client, gameIds: string[]): Promise<Map<string, ProviderGameInfo>> {
  const info = new Map<string, ProviderGameInfo>();

  if (gameIds.length === 0) {
    return info;
  }

  const { data, error } = await client
    .from("provider_game_mappings")
    .select("game_id, provider_name, external_game_code, external_url, metadata")
    .in("game_id", gameIds)
    .order("provider_name", { ascending: true });

  if (error) {
    throw new Error(`Reading provider mappings failed: ${error.message}`);
  }

  for (const row of data) {
    // A game should have one provider mapping, but keeping the first row makes
    // this read stable if an operator temporarily maps it to two suppliers.
    if (info.has(row.game_id)) {
      continue;
    }

    info.set(row.game_id, {
      providerName: row.provider_name,
      providerCode: row.external_game_code,
      categoryId: textMetadata(row.metadata, "category_id"),
      categoryTitle: textMetadata(row.metadata, "category_title"),
      externalUrl: row.external_url ?? null,
    });
  }

  return info;
}

export type ListAdminProductsOptions = {
  query?: string;
  publishedOnly?: boolean;
  category?: string;
};

export async function listAdminProviderCategories(): Promise<AdminProviderCategory[]> {
  await requireAdmin();

  const client = await createSupabaseServerClient();
  const { data, error } = await client
    .from("provider_game_mappings")
    .select("metadata")
    .eq("provider_name", MAXSTORE_PROVIDER_NAME);

  if (error) {
    throw new Error(`Reading provider categories failed: ${error.message}`);
  }

  const categories = new Map<string, AdminProviderCategory>();

  for (const row of data) {
    const id = textMetadata(row.metadata, "category_id");
    const title = textMetadata(row.metadata, "category_title");

    if (!id) {
      continue;
    }

    const current = categories.get(id);

    categories.set(id, {
      id,
      title: title ?? `Category ${id}`,
      count: (current?.count ?? 0) + 1,
    });
  }

  return [...categories.values()].sort((first, second) => first.title.localeCompare(second.title));
}

export async function listAdminProducts({
  query,
  publishedOnly = false,
  category,
}: ListAdminProductsOptions = {}): Promise<AdminProductListItem[]> {
  await requireAdmin();

  const client = await createSupabaseServerClient();
  let games = client
    .from("products")
    .select(LIST_COLUMNS)
    .order("sort_order", { ascending: true })
    .order("name_en", { ascending: true });

  if (publishedOnly) {
    games = games.eq("is_active", true);
  }

  // Every token must match, so "pubg uc" narrows rather than widens. Tokens are
  // already stripped of the characters that would break out of a filter group.
  for (const token of toSearchTokens(query ?? "")) {
    games = games.or(orIlike(GAME_SEARCH_COLUMNS, token));
  }

  const { data, error } = await games;

  if (error) {
    throw new Error(`Reading the catalog failed: ${error.message}`);
  }

  const gameIds = data.map((game) => game.id);
  const [offerCounts, providerInfo] = await Promise.all([
    countOffersByProduct(client, gameIds),
    providerInfoByProduct(client, gameIds),
  ]);

  return data
    .map((game) => {
      const provider = providerInfo.get(game.id);

      return {
        id: game.id,
        slug: game.slug,
        nameAr: game.name_ar,
        nameEn: game.name_en,
        imageUrl: game.image_url,
        isActive: game.is_active,
        isFeatured: game.is_featured,
        showInCarousel: game.show_in_carousel,
        sortOrder: game.sort_order,
        offerCount: offerCounts.get(game.id) ?? 0,
        providerName: provider?.providerName ?? null,
        providerCode: provider?.providerCode ?? null,
        providerUrl: provider?.externalUrl ?? null,
        providerCategoryId: provider?.categoryId ?? null,
        providerCategoryTitle: provider?.categoryTitle ?? null,
      };
    })
    .filter((game) => !category || game.providerCategoryId === category);
}

/** The editable half of a game, shared by the read and the write. */
export type AdminProductFields = {
  categoryId: string | null;
  nameAr: string;
  nameEn: string;
  slug: string;
  pointsNameAr: string | null;
  pointsNameEn: string | null;
  descriptionAr: string | null;
  descriptionEn: string | null;
  imageUrl: string | null;
  logoUrl: string | null;
  carouselBadgeAr: string | null;
  carouselBadgeEn: string | null;
  sortOrder: number;
  isActive: boolean;
  isFeatured: boolean;
  showInCarousel: boolean;
  carouselOrder: number | null;
  carouselLogoTone: LogoTone | null;
  carouselColor: string | null;
};

export type AdminProduct = AdminProductFields & {
  id: string;
  providerName: string | null;
  providerCode: string | null;
  providerUrl: string | null;
  providerCategoryId: string | null;
  providerCategoryTitle: string | null;
};

export type AdminProductOffer = {
  id: string;
  slug: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string | null;
  descriptionEn: string | null;
  price: number;
  originalPrice: number | null;
  currency: string;
  isSale: boolean;
  isActive: boolean;
  sortOrder: number;
  offerType: string;
  /** Provider cost in USD, for the operator's margin check only. */
  supplierCostUsd: number | null;
  pricingMode: PricingMode;
  deliveryKind: string | null;
};

export type AdminProductDetail = {
  game: AdminProduct;
  offers: AdminProductOffer[];
};

const OFFER_COLUMNS =
  "id, slug, name_ar, name_en, description_ar, description_en, price, original_price, currency, is_sale, is_active, sort_order, offer_type, delivery_kind, provider_offer_mappings(provider_name, supplier_cost_usd, pricing_mode)";

export async function getAdminProduct(gameId: string): Promise<AdminProductDetail | null> {
  await requireAdmin();

  if (!UUID_PATTERN.test(gameId)) {
    return null;
  }

  const client = await createSupabaseServerClient();
  const { data: game, error } = await client
    .from("products")
    .select(
      "id, category_id, slug, name_ar, name_en, points_name_ar, points_name_en, description_ar, description_en, image_url, logo_url, carousel_badge_ar, carousel_badge_en, sort_order, is_active, is_featured, show_in_carousel, carousel_order, carousel_logo_tone, carousel_color",
    )
    .eq("id", gameId)
    .maybeSingle();

  if (error) {
    throw new Error(`Reading the game failed: ${error.message}`);
  }

  if (!game) {
    return null;
  }

  const [offers, providerInfo] = await Promise.all([
    client
      .from("offers")
      .select(OFFER_COLUMNS)
      .eq("product_id", gameId)
      .order("sort_order", { ascending: true })
      .order("price", { ascending: true }),
    providerInfoByProduct(client, [gameId]),
  ]);

  if (offers.error) {
    throw new Error(`Reading the game's offers failed: ${offers.error.message}`);
  }

  return {
    game: {
      id: game.id,
      categoryId: game.category_id,
      slug: game.slug,
      nameAr: game.name_ar,
      nameEn: game.name_en,
      pointsNameAr: game.points_name_ar,
      pointsNameEn: game.points_name_en,
      descriptionAr: game.description_ar,
      descriptionEn: game.description_en,
      imageUrl: game.image_url,
      logoUrl: game.logo_url,
      carouselBadgeAr: game.carousel_badge_ar,
      carouselBadgeEn: game.carousel_badge_en,
      sortOrder: game.sort_order,
      isActive: game.is_active,
      isFeatured: game.is_featured,
      showInCarousel: game.show_in_carousel,
      carouselOrder: game.carousel_order,
      carouselLogoTone: toLogoTone(game.carousel_logo_tone),
      carouselColor: game.carousel_color,
      providerName: providerInfo.get(gameId)?.providerName ?? null,
      providerCode: providerInfo.get(gameId)?.providerCode ?? null,
      providerUrl: providerInfo.get(gameId)?.externalUrl ?? null,
      providerCategoryId: providerInfo.get(gameId)?.categoryId ?? null,
      providerCategoryTitle: providerInfo.get(gameId)?.categoryTitle ?? null,
    },
    offers: offers.data.map((offer) => {
      // The mapping is embedded as a collection because `offer_id` alone is not
      // unique across providers; only the G2Bulk row carries our cost.
      const mapping = offer.provider_offer_mappings.find(
        (row) => row.provider_name === G2BULK_PROVIDER_NAME,
      );

      return {
        id: offer.id,
        slug: offer.slug,
        nameAr: offer.name_ar,
        nameEn: offer.name_en,
        descriptionAr: offer.description_ar,
        descriptionEn: offer.description_en,
        price: offer.price,
        originalPrice: offer.original_price,
        currency: offer.currency,
        isSale: offer.is_sale,
        isActive: offer.is_active,
        sortOrder: offer.sort_order,
        offerType: offer.offer_type,
        supplierCostUsd: mapping?.supplier_cost_usd ?? null,
        pricingMode: toPricingMode(mapping?.pricing_mode),
        deliveryKind: offer.delivery_kind ?? null,
      };
    }),
  };
}

export async function updateAdminProduct(gameId: string, fields: AdminProductFields): Promise<void> {
  await requireAdmin();

  if (!UUID_PATTERN.test(gameId)) {
    throw new ProductNotFoundError();
  }

  const client = await createSupabaseServerClient();

  // A slug is the game's public URL, so a collision is reported as its own
  // failure instead of a generic "could not save".
  const { data: clash, error: clashError } = await client
    .from("products")
    .select("id")
    .eq("slug", fields.slug)
    .neq("id", gameId)
    .maybeSingle();

  if (clashError) {
    throw new Error(`Checking the slug failed: ${clashError.message}`);
  }

  if (clash) {
    throw new SlugTakenError();
  }

  const { data, error } = await client
    .from("products")
    .update({
      category_id: fields.categoryId,
      name_ar: fields.nameAr,
      name_en: fields.nameEn,
      slug: fields.slug,
      points_name_ar: fields.pointsNameAr,
      points_name_en: fields.pointsNameEn,
      description_ar: fields.descriptionAr,
      description_en: fields.descriptionEn,
      image_url: fields.imageUrl,
      logo_url: fields.logoUrl,
      carousel_badge_ar: fields.carouselBadgeAr,
      carousel_badge_en: fields.carouselBadgeEn,
      sort_order: fields.sortOrder,
      is_active: fields.isActive,
      is_featured: fields.isFeatured,
      show_in_carousel: fields.showInCarousel,
      carousel_order: fields.carouselOrder,
      carousel_logo_tone: fields.carouselLogoTone,
      carousel_color: fields.carouselColor,
      updated_at: new Date().toISOString(),
    })
    .eq("id", gameId)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      throw new SlugTakenError();
    }

    throw new Error(`Saving the game failed: ${error.message}`);
  }

  if (!data) {
    throw new ProductNotFoundError();
  }
}

export type AdminOfferUpdate = {
  id: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string | null;
  descriptionEn: string | null;
  price: number;
  originalPrice: number | null;
  isSale: boolean;
  isActive: boolean;
  sortOrder: number;
  pricingMode: PricingMode;
};

/**
 * Save one game's packages.
 *
 * Rows are matched against the offers the game actually owns, so a forged id
 * cannot reach another game's pricing. A row whose offer vanished since the form
 * was rendered is skipped rather than failing the whole save — the rest of the
 * admin's edits are still worth keeping.
 */
export async function updateAdminOffers(gameId: string, rows: AdminOfferUpdate[]): Promise<void> {
  await requireAdmin();

  if (!UUID_PATTERN.test(gameId)) {
    throw new ProductNotFoundError();
  }

  if (rows.length === 0) {
    return;
  }

  const client = await createSupabaseServerClient();
  const { data: owned, error: ownedError } = await client
    .from("offers")
    .select("id")
    .eq("product_id", gameId);

  if (ownedError) {
    throw new Error(`Reading the game's offers failed: ${ownedError.message}`);
  }

  const ownedIds = new Set(owned.map((offer) => offer.id));
  const writable = rows.filter((row) => ownedIds.has(row.id));

  if (writable.length === 0) {
    return;
  }

  const { data: mappings, error: mappingsError } = await client
    .from("provider_offer_mappings")
    .select("offer_id")
    .eq("provider_name", G2BULK_PROVIDER_NAME)
    .in(
      "offer_id",
      writable.map((row) => row.id),
    );

  if (mappingsError) {
    throw new Error(`Reading offer mappings failed: ${mappingsError.message}`);
  }

  const mapped = new Set(mappings.map((mapping) => mapping.offer_id));
  const updatedAt = new Date().toISOString();

  for (const row of writable) {
    const { error } = await client
      .from("offers")
      .update({
        name_ar: row.nameAr,
        name_en: row.nameEn,
        description_ar: row.descriptionAr,
        description_en: row.descriptionEn,
        price: row.price,
        original_price: row.originalPrice,
        is_sale: row.isSale,
        is_active: row.isActive,
        sort_order: row.sortOrder,
        updated_at: updatedAt,
      })
      .eq("id", row.id)
      .eq("product_id", gameId);

    if (error) {
      throw new Error(`Saving a package failed: ${error.message}`);
    }

    // Pricing mode lives on the provider mapping, so a manually added offer has
    // nothing to write.
    if (!mapped.has(row.id)) {
      continue;
    }

    const { error: mappingError } = await client
      .from("provider_offer_mappings")
      .update({ pricing_mode: row.pricingMode, updated_at: updatedAt })
      .eq("offer_id", row.id)
      .eq("provider_name", G2BULK_PROVIDER_NAME);

    if (mappingError) {
      throw new Error(`Saving a package's pricing mode failed: ${mappingError.message}`);
    }
  }
}

/**
 * Deletes the game; offers and provider mappings cascade with it.
 *
 * Audited, because it is the largest single thing an administrator can undo
 * nothing about: the row is gone, and with it every package under it. Orders
 * survive — `order_items.offer_id` is `on delete set null` and each item carries
 * a purchase-time snapshot — so what the audit row has to preserve is which game
 * it was, which is why the name and slug are read before the delete rather than
 * recovered from an id that no longer resolves.
 */
export class ProviderLinkInvalidError extends Error {
  constructor() {
    super("A supplier link has to be an http(s) address.");
    this.name = "ProviderLinkInvalidError";
  }
}

/**
 * Store (or clear) the supplier listing link for one catalog entry.
 *
 * The URL lives on the provider mapping rather than the game: it describes
 * where the supplier sells it, not what we sell. Every mapping row of the
 * game is updated so an operator who briefly maps two suppliers keeps both
 * links honest, and the product core receives the change through its trigger.
 */
export async function setAdminProductProviderLink(gameId: string, rawUrl: string): Promise<void> {
  const admin = await requireAdmin();

  if (!UUID_PATTERN.test(gameId)) {
    throw new ProductNotFoundError();
  }

  const url = rawUrl.trim();

  // An empty submission clears the link rather than erroring — removing a
  // stale address is routine, and forcing a delete path for it would be cruel.
  const nextUrl = url === "" ? null : url;
  if (nextUrl !== null && (url.length > 2048 || !/^https?:\/\/\S+$/i.test(url))) {
    throw new ProviderLinkInvalidError();
  }

  const client = await createSupabaseServerClient();
  const { error } = await client
    .from("provider_game_mappings")
    .update({ external_url: nextUrl })
    .eq("game_id", gameId);

  if (error) {
    throw new Error(`Saving the supplier link failed: ${error.message}`);
  }

  if (nextUrl !== null) {
    await recordAudit({
      actorId: admin.id,
      action: "catalog.provider_link_saved",
      entityType: "game",
      entityId: gameId,
      values: { url: nextUrl },
    });
  }
}

export async function deleteAdminProduct(gameId: string): Promise<void> {
  const admin = await requireAdmin();

  if (!UUID_PATTERN.test(gameId)) {
    throw new ProductNotFoundError();
  }

  const client = await createSupabaseServerClient();
  const { data, error } = await client
    .from("products")
    .delete()
    .eq("id", gameId)
    .select("id, slug, name_ar, name_en")
    .maybeSingle();

  if (error) {
    throw new Error(`Deleting the game failed: ${error.message}`);
  }

  if (!data) {
    throw new ProductNotFoundError();
  }

  await recordAudit({
    actorId: admin.id,
    action: "catalog.game_deleted",
    entityType: "game",
    entityId: data.id,
    values: { slug: data.slug, nameAr: data.name_ar, nameEn: data.name_en },
  });
}

export type RemoveImportedResult =
  | { ok: true; name: string }
  | { ok: false; reason: "not_imported" | "unknown" };

/**
 * Remove what an import brought in, from the screen that brought it.
 *
 * The import pickers show every product the supplier carries and mark the ones
 * the store already has. Until now that mark was the end of it: undoing an
 * import meant finding the game in the catalog list and deleting it there,
 * which is a different screen reached by remembering what the supplier called
 * the thing.
 *
 * Keyed by the supplier's own code, because that is what the picker holds. A
 * voucher category arrives under a derived code, so both screens resolve
 * through the same mapping table and neither needs to know about the other.
 */
export async function removeImportedProduct(
  providerCode: string,
  providerName: string = G2BULK_PROVIDER_NAME,
): Promise<RemoveImportedResult> {
  await requireAdmin();

  const client = await createSupabaseServerClient();
  const { data: mapping, error } = await client
    .from("provider_game_mappings")
    .select("game_id, products (name_en, name_ar)")
    .eq("provider_name", providerName)
    .eq("external_game_code", providerCode)
    .maybeSingle();

  if (error) {
    return { ok: false, reason: "unknown" };
  }

  if (!mapping?.game_id) {
    // Already gone, or never imported. Both mean there is nothing to remove,
    // and a picker showing a stale mark is exactly how this is reached.
    return { ok: false, reason: "not_imported" };
  }

  const game = (Array.isArray(mapping.products) ? mapping.products[0] : mapping.products) as
    | { name_en: string; name_ar: string }
    | null;

  try {
    await deleteAdminProduct(mapping.game_id);
  } catch (deleteError) {
    return {
      ok: false,
      reason: deleteError instanceof ProductNotFoundError ? "not_imported" : "unknown",
    };
  }

  return { ok: true, name: game?.name_en || game?.name_ar || providerCode };
}

/** Raised when a package slug is already used by another package of the same game. */
export class OfferSlugTakenError extends Error {
  constructor() {
    super("That slug already belongs to another package of this game.");
    this.name = "OfferSlugTakenError";
  }
}

/** Raised when the package being removed is not one this game owns. */
export class OfferNotFoundError extends Error {
  constructor() {
    super("That package no longer exists.");
    this.name = "OfferNotFoundError";
  }
}

/**
 * Create a game by hand.
 *
 * Until now the catalog could only come from a supplier import, which made
 * anything G2Bulk does not carry — a card the owner sources themselves, a game
 * added ahead of its mapping — impossible to sell.
 *
 * Three fields, then the existing editor. Everything else about a game is an
 * edit, and asking for artwork and descriptions before the row exists would be a
 * second, longer copy of a form that already works.
 *
 * Created unpublished, always. A game with no packages is an empty page, and the
 * moment to decide it is ready is after its packages exist — not while typing
 * its name.
 */
export async function createAdminProduct(input: {
  nameAr: string;
  nameEn: string;
  slug: string;
}): Promise<string> {
  await requireAdmin();

  const client = await createSupabaseServerClient();
  const { data, error } = await client
    .from("products")
    .insert({
      name_ar: input.nameAr,
      name_en: input.nameEn,
      slug: input.slug,
      is_active: false,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      throw new SlugTakenError();
    }

    throw new Error(`Creating the game failed: ${error.message}`);
  }

  if (!data) {
    throw new Error("Creating the game returned no row.");
  }

  return data.id;
}

/**
 * Add a package to a game by hand.
 *
 * Created inactive, and that is not caution for its own sake: a package with no
 * provider mapping cannot be delivered automatically. Fulfilment reports it as
 * unmapped and the order sits paid until somebody settles it, so a manual
 * package goes on sale only when its owner has said they will handle it — which
 * is what publishing it from the editor means.
 */
export async function createAdminOffer(
  gameId: string,
  input: {
    nameAr: string;
    nameEn: string;
    descriptionAr: string | null;
    descriptionEn: string | null;
    slug: string;
    price: number;
    offerType: string;
  },
): Promise<string> {
  await requireAdmin();

  if (!UUID_PATTERN.test(gameId)) {
    throw new ProductNotFoundError();
  }

  const client = await createSupabaseServerClient();
  const { data: game, error: gameError } = await client
    .from("products")
    .select("id")
    .eq("id", gameId)
    .maybeSingle();

  if (gameError) {
    throw new Error(`Reading the game failed: ${gameError.message}`);
  }

  if (!game) {
    throw new ProductNotFoundError();
  }

  const { data, error } = await client
    .from("offers")
    .insert({
      product_id: gameId,
      name_ar: input.nameAr,
      name_en: input.nameEn,
      description_ar: input.descriptionAr,
      description_en: input.descriptionEn,
      slug: input.slug,
      price: input.price,
      offer_type: input.offerType,
      is_active: false,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    // Unique is `(game_id, slug)`: the same package name under another game is
    // fine, and only a clash within this one is an error.
    if (error.code === UNIQUE_VIOLATION) {
      throw new OfferSlugTakenError();
    }

    throw new Error(`Creating the package failed: ${error.message}`);
  }

  if (!data) {
    throw new Error("Creating the package returned no row.");
  }

  return data.id;
}

/**
 * Remove one package.
 *
 * Scoped by game as well as by id, so a forged id cannot reach another game's
 * catalog. Orders that bought it are unaffected: `order_items.offer_id` is
 * `on delete set null` and every item carries a purchase-time name snapshot, so
 * an old order still reads as what was actually sold.
 *
 * An imported package can be deleted too, and will come back on the next sync
 * that still lists it — deleting is not how a supplier's product is retired, and
 * the import is the thing that owns that decision.
 */
export async function deleteAdminOffer(gameId: string, offerId: string): Promise<void> {
  await requireAdmin();

  if (!UUID_PATTERN.test(gameId) || !UUID_PATTERN.test(offerId)) {
    throw new OfferNotFoundError();
  }

  const client = await createSupabaseServerClient();
  const { data, error } = await client
    .from("offers")
    .delete()
    .eq("id", offerId)
    .eq("product_id", gameId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(`Deleting the package failed: ${error.message}`);
  }

  if (!data) {
    throw new OfferNotFoundError();
  }
}

export type AdminCategory = {
  id: string;
  slug: string;
  nameAr: string;
  nameEn: string;
};

/**
 * The categories an import can drop a game into, and the editor can re-home it
 * under.
 *
 * Read for the dashboard only — the storefront has no category pages yet, so
 * this never feeds a public route.
 */
export async function listAdminCategories(): Promise<AdminCategory[]> {
  await requireAdmin();

  const client = await createSupabaseServerClient();
  const { data, error } = await client
    .from("categories")
    .select("id, slug, name_ar, name_en")
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(`Reading the categories failed: ${error.message}`);
  }

  return data.map((category) => ({
    id: category.id,
    slug: category.slug,
    nameAr: category.name_ar,
    nameEn: category.name_en,
  }));
}
