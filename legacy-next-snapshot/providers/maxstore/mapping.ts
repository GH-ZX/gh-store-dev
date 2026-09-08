import { toSlug } from "@/lib/catalog/slug";
import type { MaxStoreProduct } from "@/providers/maxstore/schemas";

/**
 * Pure translation between the MaxStore catalogue and the GH Store schema.
 *
 * MaxStore sells more than games — numbers, social media services, support
 * apps, recharge accounts — but the store's schema already has a shape for
 * "a thing with packages under it", and that is `games` with `offers`. A
 * category becomes the game; its products become the packages. Nothing new is
 * invented for it, so every screen that already lists a game lists these too.
 *
 * Free of I/O, so each rule is testable on its own.
 */

export const MAXSTORE_PROVIDER_NAME = "maxstore";

/**
 * Read category names from the undocumented content response.
 *
 * MaxStore may wrap categories in `data`, `categories`, or another object, so
 * this walks nested values while accepting the common id/title key variants.
 */
export function readCategoryNames(payload: unknown): Map<string, string> {
  const names = new Map<string, string>();
  const visited = new Set<object>();

  function visit(value: unknown): void {
    if (!value || typeof value !== "object" || visited.has(value)) {
      return;
    }

    visited.add(value);

    if (Array.isArray(value)) {
      value.forEach((item) => visit(item));
      return;
    }

    const entry = value as {
      id?: unknown;
      category_id?: unknown;
      categoryId?: unknown;
      name?: unknown;
      title?: unknown;
      category_name?: unknown;
      category_title?: unknown;
      price?: unknown;
      product_id?: unknown;
      product_type?: unknown;
      params?: unknown;
      qty_values?: unknown;
      available?: unknown;
    };
    const isProductLike =
      entry.price !== undefined ||
      entry.product_id !== undefined ||
      entry.product_type !== undefined ||
      entry.params !== undefined ||
      entry.qty_values !== undefined ||
      entry.available !== undefined;
    const rawId = entry.id ?? entry.category_id ?? entry.categoryId;
    const rawName = entry.name ?? entry.title ?? entry.category_name ?? entry.category_title;
    const id = rawId === undefined || rawId === null ? "" : String(rawId).trim();
    const name = typeof rawName === "string" ? rawName.trim() : "";

    if (!isProductLike && id && name) {
      names.set(id, name);
    }

    Object.values(value).forEach(visit);
  }

  visit(payload);

  return names;
}

/**
 * Extract product ids from a category content response. The endpoint has no
 * documented response example, so product-shaped rows are recognized by their
 * price/product fields instead of trusting one wrapper key.
 */
export type MaxStoreContentCategory = {
  id: string;
  title: string;
  productCount: number | null;
  availableCount: number | null;
};

/**
 * Read the provider's actual category navigation from `/content/0`.
 *
 * Product rows also carry an `id` and a `name`, so category entries are accepted
 * only when they are not product-shaped and are found under category-like keys.
 */
export function readContentCategories(payload: unknown): MaxStoreContentCategory[] {
  const categories = new Map<string, MaxStoreContentCategory>();
  const visited = new Set<object>();

  function numberValue(value: unknown): number | null {
    const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;

    return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null;
  }

  function visit(value: unknown, parentKey = ""): void {
    if (!value || typeof value !== "object" || visited.has(value)) {
      return;
    }

    visited.add(value);

    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, parentKey));
      return;
    }

    const row = value as Record<string, unknown>;
    const isProduct =
      row.price !== undefined ||
      row.product_id !== undefined ||
      row.product_type !== undefined ||
      row.params !== undefined ||
      row.qty_values !== undefined;
    const rawId = row.category_id ?? row.categoryId ?? row.id;
    const rawTitle = row.category_title ?? row.category_name ?? row.categoryTitle ?? row.name ?? row.title;
    const id = rawId === undefined || rawId === null ? "" : String(rawId).trim();
    const title = typeof rawTitle === "string" ? rawTitle.trim() : "";
    const categoryKey = parentKey.toLowerCase();
    const looksLikeCategory =
      categoryKey.includes("categor") ||
      categoryKey === "data" ||
      categoryKey === "content" ||
      categoryKey === "items" ||
      categoryKey === "children";

    if (!isProduct && id && title && looksLikeCategory) {
      categories.set(id, {
        id,
        title,
        productCount: numberValue(row.product_count ?? row.productCount ?? row.products_count ?? row.count),
        availableCount: numberValue(row.available_count ?? row.availableCount ?? row.in_stock ?? row.stock_count),
      });
    }

    Object.entries(row).forEach(([key, child]) => visit(child, key));
  }

  visit(payload);

  return [...categories.values()].sort((first, second) => first.title.localeCompare(second.title));
}

export function readContentProductIds(payload: unknown): string[] {
  const ids = new Set<string>();
  const visited = new Set<object>();

  function visit(value: unknown, parentKey = ""): void {
    if (!value || typeof value !== "object" || visited.has(value)) {
      return;
    }

    visited.add(value);

    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, parentKey));
      return;
    }

    const row = value as {
      id?: unknown;
      product_id?: unknown;
      productId?: unknown;
      price?: unknown;
      product_type?: unknown;
      params?: unknown;
      qty_values?: unknown;
      available?: unknown;
    };
    const productId = row.product_id ?? row.productId ?? row.id;
    const isProductLike =
      parentKey === "products" ||
      parentKey === "items" ||
      row.product_id !== undefined ||
      row.productId !== undefined ||
      row.price !== undefined ||
      row.product_type !== undefined ||
      row.params !== undefined ||
      row.qty_values !== undefined ||
      row.available !== undefined;

    if (isProductLike && productId !== undefined && productId !== null) {
      const id = String(productId).trim();

      if (id) {
        ids.add(id);
      }
    }

    Object.entries(value).forEach(([key, child]) => visit(child, key));
  }

  visit(payload);

  return [...ids];
}

/**
 * The code a category is mapped under.
 *
 * Namespaced, because `provider_game_mappings` is keyed by
 * `(provider_name, external_game_code)` and a bare numeric id is exactly the
 * kind of value two suppliers could both produce. The prefix makes a collision
 * impossible to write by accident.
 */
export function toMaxStoreGameCode(categoryId: string | number): string {
  return `category:${String(categoryId).trim()}`;
}

/** The category id back out of a mapping code, or null when it is not one of ours. */
export function fromMaxStoreGameCode(code: string): string | null {
  return code.startsWith("category:") ? code.slice("category:".length) || null : null;
}

/**
 * A URL segment for a category.
 *
 * The id is kept in the slug rather than trusted to the name alone: MaxStore's
 * category titles are Arabic for the most part, which slugifies to nothing, and
 * two categories may share a word. `maxstore-12` is ugly and unique; a blank
 * slug is a broken page.
 */
export function toMaxStoreGameSlug(input: { id: string | number; title?: string | null }): string {
  const fromTitle = toSlug(input.title ?? "");
  const id = String(input.id).trim();
  const safeId = toSlug(id) || "category";

  return fromTitle ? `${fromTitle}-${safeId}` : `maxstore-${safeId}`;
}

/** A URL segment for a product, unique within its category by construction. */
export function toMaxStoreOfferSlug(product: Pick<MaxStoreProduct, "id" | "name">): string {
  const fromName = toSlug(product.name ?? "");

  return fromName ? `${fromName}-${product.id}` : `product-${product.id}`;
}

/**
 * What kind of thing the store is selling.
 *
 * MaxStore's `product_type` is documented only through the one value that
 * matters for quantity — `package` — so anything else is treated as a top-up.
 * That is the safer default of the two: a top-up asks the customer for the
 * account fields the product declares, and a gift card would not.
 */
export function toOfferType(productType: string | null): "topup" | "gift_card" {
  return (productType ?? "").toLowerCase() === "voucher" ? "gift_card" : "topup";
}

/**
 * The dynamic fields a product asks the customer for.
 *
 * MaxStore documents `params` only as "product-specific dynamic fields, e.g.
 * player_id", with no shape. So this reads the two shapes such a field is
 * plausibly sent as — a list of names, or an object keyed by name — and returns
 * nothing at all for anything else rather than guessing a third.
 *
 * Returning nothing is safe: an order with a missing required field is refused
 * by MaxStore with code 106, which surfaces as a failed order and a refund,
 * rather than as a silent delivery to the wrong account.
 */
export function readProductParams(params: unknown): string[] {
  if (Array.isArray(params)) {
    return params
      .map((entry) => {
        if (typeof entry === "string") {
          return entry;
        }

        const name = (entry as { name?: unknown; key?: unknown } | null)?.name;
        const key = (entry as { name?: unknown; key?: unknown } | null)?.key;

        return typeof name === "string" ? name : typeof key === "string" ? key : "";
      })
      .filter((name) => name.length > 0);
  }

  if (params && typeof params === "object") {
    return Object.keys(params as Record<string, unknown>);
  }

  return [];
}

/**
 * The quantity bounds a product accepts.
 *
 * `qty_values` carries `min`/`max` per the documentation, and a package is fixed
 * at one whatever it says. An unreadable value becomes 1..1, which is the
 * conservative reading: a customer can still buy, and nobody is offered a
 * quantity the supplier may refuse.
 */
export function readQuantityBounds(
  qtyValues: unknown,
  quantityFixed: boolean,
): { min: number; max: number } {
  if (quantityFixed) {
    return { min: 1, max: 1 };
  }

  const source = (qtyValues ?? {}) as { min?: unknown; max?: unknown };
  const min = Number(source.min);
  const max = Number(source.max);

  const safeMin = Number.isFinite(min) && min >= 1 ? Math.floor(min) : 1;
  const safeMax = Number.isFinite(max) && max >= safeMin ? Math.floor(max) : safeMin;

  return { min: safeMin, max: safeMax };
}

/**
 * The structured field definitions MaxStore carries on many of its products.
 *
 * `params` is a list of Arabic labels (e.g. `["معرّف اللاعب"]`); `params_meta`
 * is the same information with a type, a key, and labels in both languages.  The
 * store needs the latter to render the right input at checkout, but neither the
 * key nor the type is documented, so this reads what the payload actually
 * contains.
 *
 * The output shape is intentionally compatible with `offers.input_fields` in the
 * database: each entry carries `field_key`, `field_type`, `label_ar`,
 * `label_en`, `placeholder_ar`, `placeholder_en`, `is_required`, and `options`.
 * This lets the caller write the result straight into the column without a
 * second mapping step.
 */
export function readProductParamsMeta(
  paramsMeta: unknown,
): {
  field_key: string;
  field_type: string;
  label_ar: string | null;
  label_en: string | null;
  placeholder_ar: string | null;
  placeholder_en: string | null;
  is_required: boolean;
  options: unknown;
}[] {
  if (!Array.isArray(paramsMeta)) {
    return [];
  }

  const KNOWN_TYPES = new Set(["text", "number", "email", "select", "password", "tel", "textarea"]);

  return paramsMeta
    .filter((entry): entry is Record<string, unknown> =>
      entry !== null && typeof entry === "object" && !Array.isArray(entry),
    )
    .map((entry) => {
      const rawKey =
        typeof entry.key === "string"
          ? entry.key
          : typeof entry.name === "string"
            ? entry.name
            : typeof entry.field_key === "string"
              ? entry.field_key
              : "";

      if (!rawKey) {
        return null;
      }

      const fieldType =
        typeof entry.type === "string" && KNOWN_TYPES.has(entry.type)
          ? entry.type
          : typeof entry.field_type === "string" && KNOWN_TYPES.has(entry.field_type)
            ? entry.field_type
            : "text";

      const labelAr =
        typeof entry.label_ar === "string"
          ? entry.label_ar
          : typeof entry.label === "string"
            ? entry.label
            : typeof entry.name === "string"
              ? entry.name
              : null;
      const labelEn =
        typeof entry.label_en === "string"
          ? entry.label_en
          : typeof entry.label === "string"
            ? entry.label
            : typeof entry.name === "string"
              ? entry.name
              : null;

      return {
        field_key: rawKey.trim(),
        field_type: fieldType,
        label_ar: labelAr?.trim() || null,
        label_en: labelEn?.trim() || null,
        placeholder_ar: typeof entry.placeholder_ar === "string" ? entry.placeholder_ar.trim() || null : null,
        placeholder_en: typeof entry.placeholder_en === "string" ? entry.placeholder_en.trim() || null : null,
        is_required: entry.required !== false,
        options: Array.isArray(entry.options) ? entry.options : [],
      };
    })
    .filter(
      (entry): entry is NonNullable<typeof entry> => entry !== null && entry.field_key.length > 0,
    );
}
