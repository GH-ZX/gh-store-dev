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

  return fromTitle ? `${fromTitle}-${id}` : `maxstore-${id}`;
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
