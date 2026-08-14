import { z } from "zod";

/**
 * MaxStore response shapes, as `docs/providers/maxstore-api.md` describes them.
 *
 * Every field the documentation does not guarantee is optional, and every number
 * is coerced. This is not defensiveness for its own sake: nothing here has been
 * checked against a live key yet, and a schema that insists on a shape the
 * provider does not actually send turns a working integration into an empty
 * screen. Where the two disagree, the provider is right and this file is the
 * thing that changes.
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
  price: money.optional(),
  category_id: id.optional(),
  available: z.union([z.boolean(), z.number(), z.string()]).optional(),
  product_type: z.string().optional(),
  qty_values: z.unknown().optional(),
  params: z.unknown().optional(),
});

export const productsSchema = z.union([
  z.array(productSchema),
  // Some endpoints on this API wrap their payload in `data`; the products list
  // is documented bare, so both are accepted rather than betting on one.
  z.object({ data: z.array(productSchema) }).transform((value) => value.data),
]);

export type MaxStoreProduct = {
  id: string;
  name: string;
  price: number;
  categoryId: string | null;
  available: boolean;
  productType: string | null;
  /** Fixed at 1 for a package, per the documentation. */
  quantityFixed: boolean;
  /** Carried through unparsed: neither shape is documented beyond an example. */
  qtyValues: unknown;
  params: unknown;
};

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
