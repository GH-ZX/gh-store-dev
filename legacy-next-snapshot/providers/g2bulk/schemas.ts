import { z } from "zod";

/**
 * G2Bulk response shapes, exactly as documented in
 * `docs/providers/g2bulk-api.md`. Nothing here may be invented: an unexpected
 * shape must surface as a contract error rather than be coerced into the
 * catalog.
 *
 * Note the two response styles in the provider's own API: the catalog and order
 * endpoints answer `{ success: true, ... }`, while the game field and server
 * endpoints answer `{ code: "200", ... }`.
 */

/** `GET /v1/getMe` */
export const getMeSchema = z.object({
  success: z.literal(true),
  user_id: z.number(),
  username: z.string().nullish(),
  first_name: z.string().nullish(),
  balance: z.number(),
});

export type G2BulkAccount = z.infer<typeof getMeSchema>;

/** `GET /v1/games` */
export const gamesSchema = z.object({
  success: z.literal(true),
  games: z.array(
    z.object({
      id: z.number(),
      code: z.string().min(1),
      name: z.string().min(1),
      image_url: z.string().nullish(),
    }),
  ),
});

export type G2BulkGame = z.infer<typeof gamesSchema>["games"][number];

/** `GET /v1/games/:code/catalogue` */
export const gameCatalogueSchema = z.object({
  success: z.literal(true),
  game: z.object({
    code: z.string().min(1),
    name: z.string().min(1),
    image_url: z.string().nullish(),
  }),
  catalogues: z.array(
    z.object({
      id: z.number(),
      name: z.string().min(1),
      amount: z.number().nonnegative(),
    }),
  ),
});

export type G2BulkCatalogue = z.infer<typeof gameCatalogueSchema>;
export type G2BulkCatalogueItem = G2BulkCatalogue["catalogues"][number];

/** `POST /v1/games/fields` */
export const gameFieldsSchema = z.object({
  code: z.string(),
  info: z.object({
    fields: z.array(z.string()),
    notes: z.string().nullish(),
  }),
});

export type G2BulkGameFields = z.infer<typeof gameFieldsSchema>;

/** `POST /v1/games/servers` — a 403 means the game needs no server. */
export const gameServersSchema = z.object({
  code: z.string(),
  servers: z.record(z.string(), z.string()),
});

export type G2BulkGameServers = z.infer<typeof gameServersSchema>;

/** `GET /v1/products` and `GET /v1/products/:id` */
export const productsSchema = z.object({
  success: z.literal(true),
  products: z.array(
    z.object({
      id: z.number(),
      title: z.string().min(1),
      description: z.string().nullish(),
      category_id: z.number().nullish(),
      category_title: z.string().nullish(),
      unit_price: z.number().nonnegative(),
      face_value: z.number().nullish(),
      image_url: z.string().nullish(),
      stock: z.number().nullish(),
    }),
  ),
});

export type G2BulkProduct = z.infer<typeof productsSchema>["products"][number];

/** Documented error envelope: `{ "success": false, "message": "..." }` */
export const errorEnvelopeSchema = z.object({
  success: z.literal(false),
  message: z.string().nullish(),
});
