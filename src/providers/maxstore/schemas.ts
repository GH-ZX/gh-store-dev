import { z } from "zod";

/**
 * MaxStore response shapes, as `docs/providers/maxstore-api.md` describes them
 * and as live imports have amended them.
 *
 * Every field the documentation does not guarantee is optional, and every number
 * is coerced. The catalogue endpoints have been exercised against a live token
 * through the imports; the permissive style stays, because the one lesson those
 * runs keep teaching is that MaxStore renames and wraps fields freely — where
 * the API disagrees with this file, the API is right and this file changes.
 * Any endpoint not yet called in anger should be treated as unproven until its
 * first real response has been seen.
 */

/** Prices and balances arrive as either a number or a numeric string. */
const money = z.union([z.number(), z.string()]).transform((value) => {
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);

  return Number.isFinite(parsed) ? parsed : 0;
});

const id = z.union([z.number(), z.string()]).transform((value) => String(value));

export const profileSchema = z.object({
  balance: money.optional(),
  user_id: id.optional(),
  username: z.string().optional(),
});

export type MaxStoreProfile = {
  balance: number;
  userId: string | null;
  username: string | null;
};

/**
 * One sellable thing.
 *
 * `params` is the product's own list of fields a customer must supply — a
 * player id, an account name — and its shape is undocumented beyond the example,
 * so it is carried through unparsed rather than guessed at.
 */
export const productSchema = z.object({
  id: id,
  name: z.string().optional(),
  title: z.string().optional(),
  product_name: z.string().optional(),
  price: money.optional(),
  category_id: id.optional(),
  categoryId: id.optional(),
  category_title: z.string().optional(),
  category_name: z.string().optional(),
  categoryTitle: z.string().optional(),
  category: z.unknown().optional(),
  available: z.union([z.boolean(), z.number(), z.string()]).optional(),
  stock: z.union([z.number(), z.string()]).optional(),
  stock_count: z.union([z.number(), z.string()]).optional(),
  stockCount: z.union([z.number(), z.string()]).optional(),
  inventory: z.union([z.number(), z.string()]).optional(),
  quantity_available: z.union([z.number(), z.string()]).optional(),
  product_type: z.string().optional(),
  qty_values: z.unknown().optional(),
  params: z.unknown().optional(),
  // Not in the published documentation, but the same free renaming as above:
  // carried optionally so an artwork-bearing payload survives validation.
  image_url: z.string().optional(),
  image: z.string().optional(),
  img: z.string().optional(),
  photo: z.string().optional(),
});

/**
 * MaxStore has used both a bare list and wrapped lists in its API responses.
 * Normalize those envelopes before validation so a transport wrapper cannot
 * erase every product's category during import.
 */
export const productsSchema = z.preprocess((value) => {
  if (Array.isArray(value)) {
    return value;
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const record = value as { data?: unknown; products?: unknown };

  if (Array.isArray(record.products)) {
    return record.products;
  }

  if (Array.isArray(record.data)) {
    return record.data;
  }

  if (record.data && typeof record.data === "object") {
    const nested = record.data as { products?: unknown; items?: unknown };

    if (Array.isArray(nested.products)) {
      return nested.products;
    }

    if (Array.isArray(nested.items)) {
      return nested.items;
    }
  }

  return value;
}, z.array(productSchema));

export type MaxStoreProductCategory = {
  id: string | null;
  title: string | null;
};

/** Read the category from all shapes observed in MaxStore payloads. */
export function readProductCategory(product: unknown): MaxStoreProductCategory {
  if (!product || typeof product !== "object") {
    return { id: null, title: null };
  }

  const value = product as {
    category_id?: unknown;
    categoryId?: unknown;
    category_title?: unknown;
    category_name?: unknown;
    categoryTitle?: unknown;
    category?: unknown;
  };
  const nested = value.category && typeof value.category === "object"
    ? (value.category as { id?: unknown; category_id?: unknown; name?: unknown; title?: unknown })
    : null;
  const rawId = value.category_id ?? value.categoryId ?? nested?.id ?? nested?.category_id;
  const rawTitle =
    value.category_title ??
    value.category_name ??
    value.categoryTitle ??
    (typeof value.category === "string" ? value.category : undefined) ??
    nested?.name ??
    nested?.title;
  const categoryId = rawId === undefined || rawId === null ? null : String(rawId).trim() || null;
  const categoryTitle = typeof rawTitle === "string" ? rawTitle.trim() || null : null;

  return { id: categoryId, title: categoryTitle };
}

export type MaxStoreProduct = {
  id: string;
  name: string;
  price: number;
  categoryId: string | null;
  categoryTitle: string | null;
  available: boolean;
  productType: string | null;
  /** Fixed at 1 for a package, per the documentation. */
  quantityFixed: boolean;
  /** Carried through unparsed: neither shape is documented beyond an example. */
  qtyValues: unknown;
  params: unknown;
  /** Null means the provider exposes availability but no numeric inventory. */
  stockCount: number | null;
  /** Artwork when MaxStore sends one; the documentation does not promise it. */
  imageUrl: string | null;
};

/** Read an artwork URL from common MaxStore response variants. */
export function readProductImage(product: unknown): string | null {
  if (!product || typeof product !== "object") {
    return null;
  }

  const value = product as {
    image_url?: unknown;
    image?: unknown;
    img?: unknown;
    photo?: unknown;
  };
  const raw = value.image_url ?? value.image ?? value.img ?? value.photo;

  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

/** Read a numeric inventory value from common MaxStore response variants. */
export function readStockCount(product: unknown): number | null {
  if (!product || typeof product !== "object") {
    return null;
  }

  const value = product as {
    stock?: unknown;
    stock_count?: unknown;
    stockCount?: unknown;
    inventory?: unknown;
    quantity_available?: unknown;
  };
  const raw = value.stock_count ?? value.stockCount ?? value.stock ?? value.inventory ?? value.quantity_available;

  if (raw === undefined || raw === null || raw === "") {
    return null;
  }

  const parsed = typeof raw === "number" ? raw : Number(raw);

  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null;
}

/** `available` may arrive as a boolean, a 0/1, or the string form of either. */
export function readAvailable(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value > 0;
  }

  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();

    return trimmed === "1" || trimmed === "true" || trimmed === "yes";
  }

  // Undocumented shape: assume sellable rather than hiding a live product.
  return true;
}

export const orderStatuses = ["accept", "wait", "reject"] as const;
export type MaxStoreOrderStatus = (typeof orderStatuses)[number];

export const orderSchema = z.object({
  status: z.unknown().optional(),
  data: z
    .object({
      order_id: id.optional(),
      status: z.string().optional(),
      price: money.optional(),
      data: z.unknown().optional(),
    })
    .optional(),
});

export const checkSchema = z.object({
  status: z.unknown().optional(),
  data: z
    .array(
      z.object({
        order_id: id.optional(),
        status: z.string().optional(),
        price: money.optional(),
        quantity: z.union([z.number(), z.string()]).optional(),
        product_name: z.string().optional(),
        created_at: z.string().optional(),
        delivery: z.unknown().optional(),
        data: z.unknown().optional(),
      }),
    )
    .optional(),
});

/**
 * Map a reported order status onto what the store does about it.
 *
 * `wait` is not failure — it is the same "still working" that G2Bulk's pending
 * means, and refunding it would give the goods away. Anything unrecognised is
 * treated as still working for the same reason: only an explicit `reject`
 * settles an order against the customer.
 */
export function classifyOrderStatus(value: unknown): "completed" | "failed" | "pending" {
  const status = typeof value === "string" ? value.trim().toLowerCase() : "";

  if (status === "accept" || status === "accepted" || status === "success") {
    return "completed";
  }

  if (status === "reject" || status === "rejected" || status === "failed") {
    return "failed";
  }

  return "pending";
}
