import { z } from "zod";

/**
 * BatStore response shapes, as `docs/providers/batstore-api.md` describes them.
 *
 * That document is a transcription of the swagger page, not observed behaviour —
 * no call has been made against a live key yet. Every field is therefore
 * optional and every number coerced, so a shape the API does not quite send
 * turns into a readable "contract" failure instead of a 500. Where the API
 * disagrees with this file, the API is right and this file changes.
 */

const money = z.union([z.number(), z.string()]).transform((value) => {
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);

  return Number.isFinite(parsed) ? parsed : 0;
});

const id = z.union([z.number(), z.string()]).transform((value) => String(value));

export const productSchema = z.object({
  id: id,
  name: z.string().nullish(),
  description: z.string().nullish(),
  emoji: z.string().nullish(),
  image_url: z.string().nullish(),
  price_usd: money.nullish(),
  standard_price_usd: money.nullish(),
  pricing_type: z.string().nullish(),
  special_price_expires_at: z.string().nullish(),
  warranty_days: z.union([z.number(), z.string()]).nullish(),
  delivery_type: z.string().nullish(),
  stock: z.union([z.number(), z.string()]).nullish(),
  price_tiers: z.array(z.unknown()).nullish(),
  api_test: z.boolean().nullish(),
});

export type BatStoreProduct = {
  id: string;
  name: string;
  description: string | null;
  emoji: string | null;
  imageUrl: string | null;
  priceUsd: number;
  standardPriceUsd: number | null;
  pricingType: string | null;
  deliveryType: string | null;
  stock: number | null;
  isTest: boolean;
};

export function toBatStoreProduct(product: z.input<typeof productSchema>): BatStoreProduct {
  const priceUsd = typeof product.price_usd === "number" ? product.price_usd : Number.parseFloat(product.price_usd ?? "");
  const standardPriceUsd =
    typeof product.standard_price_usd === "number"
      ? product.standard_price_usd
      : Number.parseFloat(product.standard_price_usd ?? "");

  return {
    id: String(product.id).trim(),
    name: product.name?.trim() || String(product.id).trim(),
    description: product.description?.trim() || null,
    emoji: product.emoji?.trim() || null,
    imageUrl: product.image_url?.trim() || null,
    priceUsd: Number.isFinite(priceUsd) ? priceUsd : 0,
    standardPriceUsd: Number.isFinite(standardPriceUsd) ? standardPriceUsd : null,
    pricingType: product.pricing_type?.trim() || null,
    deliveryType: product.delivery_type?.trim() || null,
    stock:
      product.stock === null || product.stock === undefined
        ? null
        : Number.parseInt(String(product.stock), 10),
    isTest: product.api_test === true,
  };
}

/**
 * The products list, as `GET /api/reseller/products` reports it.
 *
 * The live API wraps the array in `{ success, products }` — the swagger example
 * is a bare array, which is how this ended up wrong once — so both shapes are
 * accepted rather than betting on one.
 */
export const productsSchema = z.union([
  z.array(productSchema),
  z
    .object({
      success: z.boolean().nullish(),
      products: z.array(productSchema).nullish(),
    })
    .transform((value) => value.products ?? []),
]);

export type BatStoreAccount = {
  username: string;
  balance: number;
};

/**
 * An order, as both `POST /orders` and `GET /orders/{order_id}` report it.
 *
 * The create response may carry the order directly or wrapped in an `order`
 * key; both are accepted because only a live call can tell which it is.
 */
const orderBodySchema = z.object({
  id: id.nullish(),
  status: z.string().nullish(),
  product_id: id.nullish(),
  product_name: z.string().nullish(),
  quantity: z.union([z.number(), z.string()]).nullish(),
  amount_usd: money.nullish(),
  delivery_type: z.string().nullish(),
  customer_reference: z.string().nullish(),
  idempotency_key: z.string().nullish(),
  activation_identifier: z.string().nullish(),
  created_at: z.string().nullish(),
  items: z
    .array(
      z.object({
        id: id.nullish(),
        account_data: z.unknown().nullish(),
      }),
    )
    .nullish(),
});

const orderWrapperSchema = z.object({
  success: z.boolean().nullish(),
  order: orderBodySchema.nullish(),
});

export const orderSchema = z.union([orderBodySchema, orderWrapperSchema]);

export type BatStoreOrderItem = {
  id: string;
  accountData: unknown;
};

export type BatStoreOrder = {
  id: string;
  status: string | null;
  productId: string | null;
  productName: string | null;
  quantity: number;
  amountUsd: number;
  items: BatStoreOrderItem[];
};

export function toBatStoreOrder(order: z.infer<typeof orderSchema>): BatStoreOrder {
  const body =
    "order" in order && order.order ? order.order : ("id" in order ? order : null);

  return {
    id: body?.id ?? "",
    status: body?.status?.trim() || null,
    productId: body?.product_id ?? null,
    productName: body?.product_name?.trim() || null,
    quantity:
      body?.quantity === null || body?.quantity === undefined
        ? 1
        : Number.parseInt(String(body.quantity), 10),
    amountUsd: body?.amount_usd ?? 0,
    items: (body?.items ?? []).map((item) => ({
      id: item.id ?? "",
      accountData: item.account_data ?? null,
    })),
  };
}

/**
 * Map an order's state onto what the store does about it.
 *
 * Delivery is read from the thing that actually matters — `items` — and from
 * the status the API documents as finished. Only an explicit failure wording
 * settles an order against the customer. Anything unrecognised stays "working",
 * because refunding an order that is about to deliver gives the goods away.
 */
export function classifyOrderStatus(order: BatStoreOrder): "completed" | "failed" | "pending" {
  if (order.items.length > 0) {
    return "completed";
  }

  const status = order.status?.trim().toUpperCase() ?? "";

  if (status === "COMPLETED") {
    return "completed";
  }

  if (
    status === "CANCELLED" ||
    status === "CANCELED" ||
    status === "FAILED" ||
    status === "REFUNDED" ||
    status === "REJECTED" ||
    status === "ERROR"
  ) {
    return "failed";
  }

  return "pending";
}