import { toSlug } from "@/lib/catalog/slug";
import type { BatStoreProduct } from "@/providers/batstore/schemas";

/**
 * Pure translation between the BatStore catalogue and the GH Store schema.
 *
 * BatStore sells flat products — a game top-up, an account, an email, a
 * subscription — all needing an activation identifier (a Telegram ID, an email)
 * to deliver against. Each product becomes its own `games` container with one
 * `offer` underneath, the same shape the other imports settled on, because the
 * storefront only renders offers inside a container. The store category the
 * container lands in is the importer's choice, not the provider's.
 *
 * Free of I/O, so each rule is testable on its own.
 */

export const BATSTORE_PROVIDER_NAME = "batstore";

/**
 * The code a product is mapped under.
 *
 * Namespaced, because `provider_game_mappings` is keyed by
 * `(provider_name, external_game_code)` and a bare id is exactly the kind of
 * value two suppliers could both produce. The prefix makes a collision
 * impossible to write by accident.
 */
export function toBatStoreGameCode(productId: string | number): string {
  return `product:${String(productId).trim()}`;
}

/** A URL segment for a product's container, unique by construction. */
export function toBatStoreGameSlug(product: Pick<BatStoreProduct, "id" | "name">): string {
  const fromName = toSlug(product.name ?? "");

  return fromName ? `${fromName}-${product.id}` : `batstore-${product.id}`;
}

/** A URL segment for the single offer a product carries. */
export function toBatStoreOfferSlug(product: Pick<BatStoreProduct, "id" | "name">): string {
  const fromName = toSlug(product.name ?? "");

  return fromName ? `${fromName}-${product.id}` : `batstore-${product.id}`;
}

/**
 * What kind of thing the store is selling.
 *
 * Every BatStore product is delivered against an activation identifier the
 * customer supplies at checkout, so they are all top-ups for the storefront —
 * a gift card would deliver a code instead.
 */
export function toOfferType(_product: Pick<BatStoreProduct, "id" | "name">): "topup" {
  return "topup";
}

/** The single dynamic field a BatStore product needs from the customer. */
export const ACTIVATION_FIELD_KEY = "activation_identifier";