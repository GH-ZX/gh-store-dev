import { z } from "zod";

/**
 * Fulfilment response shapes, exactly as documented in
 * `docs/providers/g2bulk-api.md`. Nothing here is invented: a payload that does
 * not match must surface as a contract error rather than be treated as a
 * delivered order.
 */

/** `POST /v1/games/:code/order` */
export const gameOrderSchema = z.object({
  success: z.literal(true),
  message: z.string().nullish(),
  order: z.object({
    order_id: z.union([z.number(), z.string()]),
    game: z.string().nullish(),
    catalogue: z.string().nullish(),
    player_id: z.string().nullish(),
    player_name: z.string().nullish(),
    price: z.number().nullish(),
    status: z.string(),
  }),
});

export type G2BulkGameOrder = z.infer<typeof gameOrderSchema>;

/**
 * `GET /v1/games/orders`
 *
 * Used for polling. The contract lists `POST /v1/games/order/status` but does
 * not document its request body or response, and guessing either is forbidden —
 * so state is read from this fully documented list endpoint and matched on
 * `order_id`.
 */
export const gameOrdersListSchema = z.object({
  success: z.literal(true),
  orders: z.array(
    z.object({
      order_id: z.union([z.number(), z.string()]),
      game_code: z.string().nullish(),
      player_id: z.string().nullish(),
      player_name: z.string().nullish(),
      denom_id: z.string().nullish(),
      price: z.number().nullish(),
      status: z.string(),
      is_refunded: z.boolean().nullish(),
      created_at: z.string().nullish(),
      completed_at: z.string().nullish(),
    }),
  ),
  pagination: z
    .object({
      page: z.number(),
      limit: z.number(),
      total: z.number(),
      total_pages: z.number(),
    })
    .nullish(),
});

/** `POST /v1/games/checkPlayerId` — `valid` is the documented success marker. */
export const checkPlayerSchema = z.object({
  valid: z.string().nullish(),
  name: z.string().nullish(),
  openid: z.string().nullish(),
});

/** `POST /v1/products/:id/purchase` */
export const voucherPurchaseSchema = z.object({
  success: z.literal(true),
  order_id: z.union([z.number(), z.string()]),
  transaction_id: z.union([z.number(), z.string()]).nullish(),
  product_id: z.union([z.number(), z.string()]).nullish(),
  product_title: z.string().nullish(),
  status: z.string(),
  delivery_items: z.array(z.string()).nullish(),
  poll_url: z.string().nullish(),
});

/** `GET /v1/orders/:id/delivery` */
export const voucherDeliverySchema = z.object({
  success: z.literal(true).nullish(),
  status: z.string().nullish(),
  delivery_items: z.array(z.string()).nullish(),
});

/**
 * Documented top-up lifecycle: PENDING → PROCESSING → COMPLETED | FAILED.
 *
 * The list endpoint returns lowercase (`"completed"`), the order response
 * uppercase (`"PENDING"`), so comparison is always case-folded.
 */
export type TerminalState = "completed" | "failed" | "pending";

export function classifyProviderStatus(status: string | null | undefined): TerminalState {
  const value = status?.trim().toLowerCase() ?? "";

  if (value === "completed" || value === "success") {
    return "completed";
  }

  if (value === "failed" || value === "cancelled" || value === "refunded") {
    return "failed";
  }

  return "pending";
}
